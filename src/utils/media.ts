/**
 * Pictures and videos in posts, kept on the mesh's storage servers (PigeonFS). A file is cut into pieces
 * of CHUNK bytes; each piece is a blob there, named by its SHA-256 (the servers check it, and so does
 * every reader). A post names its pieces in order; a file of many pieces names one more piece that lists
 * them. Nothing here is encrypted to anyone: a post's media is as public as the post.
 */
import { getSubtle } from 'unsea'
import type { MediaRef } from './records'

/** Bytes in a piece: under a blob's most (160 kB, PeerPigeon's MAX_BLOB_BYTES). */
export const CHUNK = 128 * 1024
/** Pieces named in the post itself; more go in a list piece. */
export const INLINE_CHUNKS = 16
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
/** A picture's longest side after it is made smaller for posting. */
export const IMAGE_SIDE = 1600

/** Where pieces are kept: the storage servers, through this page's link to them. */
export interface BlobStore {
  /** Keeps the bytes; resolves with how many servers took them. */
  put(bytes: Uint8Array): Promise<number>
  /** The bytes with this SHA-256, or null when no server has them. */
  get(hash: string): Promise<Uint8Array | null>
}

/**
 * A piece could not be had from the storage servers just now: they may not be reached yet (a page just
 * opened), be restarting, or not hold it. Worth another try; nothing here says the file is gone.
 */
export class NotYet extends Error {
  constructor() { super('The storage servers did not answer with this file.') }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // unsea's SubtleCrypto: WebCrypto's, or its stand-in on a page without one (plain http).
  const digest = new Uint8Array(await getSubtle().digest('SHA-256', bytes as BufferSource))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function cut(bytes: Uint8Array, size = CHUNK): Uint8Array[] {
  const out: Uint8Array[] = []
  for (let at = 0; at < bytes.length; at += size) out.push(bytes.subarray(at, Math.min(bytes.length, at + size)))
  return out
}

/** Run `work` over `items`, `lanes` at a time, in order of starting; the first failure stops the rest. */
async function inLanes<T, R>(items: T[], lanes: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0, failed = false
  const lane = async () => {
    while (!failed && next < items.length) {
      const i = next++
      try { out[i] = await work(items[i], i) } catch (error) { failed = true; throw error }
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, lane))
  return out
}

async function keep(store: BlobStore, piece: Uint8Array): Promise<string> {
  const hash = await sha256Hex(piece)
  // Twice, a moment apart: right after the page opens its link to the servers may still be forming.
  for (let attempt = 0; attempt < 2; attempt++) {
    if ((await store.put(piece.slice())) > 0) return hash
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('No storage server took the file. Try again in a moment.')
}

/** Put a file's bytes on the servers; resolves with how a post names them. `progress`: 0 to 1. */
export async function upload(store: BlobStore, bytes: Uint8Array, about: Pick<MediaRef, 'kind' | 'type' | 'name' | 'w' | 'h'>, progress?: (done: number) => void): Promise<MediaRef> {
  const pieces = cut(bytes)
  let done = 0
  const chunks = await inLanes(pieces, 4, async (piece) => {
    const hash = await keep(store, piece)
    progress?.(++done / pieces.length)
    return hash
  })
  const ref: MediaRef = { ...about, size: bytes.length }
  if (chunks.length <= INLINE_CHUNKS) return { ...ref, chunks }
  const list = new TextEncoder().encode(chunks.join('\n'))
  if (list.length > CHUNK) throw new Error('That file is too large to post.')
  return { ...ref, list: await keep(store, list) }
}

/** A posted file's pieces, in order. */
export async function chunksOf(store: BlobStore, ref: MediaRef): Promise<string[]> {
  if (ref.chunks) return ref.chunks
  const list = ref.list ? await store.get(ref.list) : null
  if (!list) throw new NotYet()
  const chunks = new TextDecoder().decode(list).split('\n').filter((h) => /^[0-9a-f]{64}$/.test(h))
  // What it lists must be about the size it says: a list can't make a reader fetch without end.
  if (!chunks.length || chunks.length > Math.ceil(ref.size / CHUNK) + 1) throw new Error('This file is not as its post describes it.')
  return chunks
}

/** A posted file's bytes, from the servers. `progress`: 0 to 1. */
export async function download(store: BlobStore, ref: MediaRef, progress?: (done: number) => void): Promise<Uint8Array> {
  const chunks = await chunksOf(store, ref)
  let done = 0
  const pieces = await inLanes(chunks, 6, async (hash) => {
    const piece = await store.get(hash)
    if (!piece) throw new NotYet()
    progress?.(++done / chunks.length)
    return piece
  })
  const size = pieces.reduce((n, p) => n + p.length, 0)
  if (size !== ref.size) throw new Error('This file is not as its post describes it.')
  const out = new Uint8Array(size)
  let at = 0
  for (const p of pieces) { out.set(p, at); at += p.length }
  return out
}

/** The new size of a w x h picture whose longest side is at most `side` (never larger than it was). */
export function fit(w: number, h: number, side = IMAGE_SIDE): { w: number; h: number } {
  const scale = Math.min(1, side / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/**
 * A picture or video as it will be posted: a picture made smaller (JPEG, IMAGE_SIDE on its longest side;
 * a GIF kept as it is, to stay animated), a video as it is. Throws, in words for the person, when it
 * can't be posted.
 */
export async function prepare(file: File): Promise<{ bytes: Uint8Array; about: Pick<MediaRef, 'kind' | 'type' | 'name' | 'w' | 'h'> }> {
  const name = file.name.slice(0, 120)
  if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error(`Videos can be up to ${MAX_VIDEO_BYTES / 1024 / 1024} MB: this one is ${(file.size / 1024 / 1024).toFixed(0)} MB.`)
    return { bytes: new Uint8Array(await file.arrayBuffer()), about: { kind: 'video', type: file.type, name } }
  }
  if (!file.type.startsWith('image/')) throw new Error('Only pictures and videos can be posted.')
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('That picture could not be read.')
  try {
    if (file.type === 'image/gif' && file.size <= MAX_IMAGE_BYTES) {
      return { bytes: new Uint8Array(await file.arrayBuffer()), about: { kind: 'image', type: file.type, name, w: bitmap.width, h: bitmap.height } }
    }
    const { w, h } = fit(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('That picture could not be made ready to post.')
    return { bytes: new Uint8Array(await blob.arrayBuffer()), about: { kind: 'image', type: 'image/jpeg', name, w, h } }
  } finally { bitmap.close() }
}
