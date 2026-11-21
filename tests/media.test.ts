import test from 'node:test'
import assert from 'node:assert/strict'
import { CHUNK, INLINE_CHUNKS, chunksOf, cut, download, fit, sha256Hex, upload, type BlobStore } from '../src/utils/media.ts'
import { parseMedia } from '../src/utils/records.ts'
import { withLinks } from '../src/utils/look.ts'

/** Storage servers, in memory: content by its SHA-256. */
function memory(): BlobStore & { size(): number; lose(hash: string): void } {
  const kept = new Map<string, Uint8Array>()
  return {
    async put(bytes) { kept.set(await sha256Hex(bytes), bytes.slice()); return 1 },
    async get(hash) { return kept.get(hash) ?? null },
    size: () => kept.size,
    lose: (hash) => { kept.delete(hash) },
  }
}
const bytesOf = (n: number) => new Uint8Array(n).map((_, i) => (i * 31 + (i >> 8)) % 251)

test('a file is cut into pieces of CHUNK bytes, the last one shorter', () => {
  const pieces = cut(bytesOf(CHUNK * 2 + 10))
  assert.deepEqual(pieces.map((p) => p.length), [CHUNK, CHUNK, 10])
  assert.equal(cut(new Uint8Array(0)).length, 0)
})

test('a small file: its pieces named in the post, and read back whole', async () => {
  const store = memory()
  const bytes = bytesOf(CHUNK * 2 + 123)
  const seen: number[] = []
  const ref = await upload(store, bytes, { kind: 'image', type: 'image/jpeg', w: 4, h: 3 }, (d) => seen.push(d))
  assert.equal(ref.chunks!.length, 3)
  assert.equal(ref.list, undefined)
  assert.equal(ref.size, bytes.length)
  assert.equal(seen[seen.length - 1], 1)
  assert.deepEqual(parseMedia(JSON.parse(JSON.stringify(ref))), ref, 'what is posted is what a reader accepts')
  assert.deepEqual(await download(store, ref), bytes)
})

test('a large file: one more piece lists the rest', async () => {
  const store = memory()
  const bytes = bytesOf(CHUNK * (INLINE_CHUNKS + 4) + 5)
  const ref = await upload(store, bytes, { kind: 'video', type: 'video/mp4' })
  assert.equal(ref.chunks, undefined)
  assert.match(ref.list!, /^[0-9a-f]{64}$/)
  assert.equal((await chunksOf(store, ref)).length, INLINE_CHUNKS + 5)
  assert.deepEqual(await download(store, ref), bytes)
})

test('a file the servers have lost part of, or that is not the size its post says, is refused', async () => {
  const store = memory()
  const bytes = bytesOf(CHUNK + 50)
  const ref = await upload(store, bytes, { kind: 'image', type: 'image/png' })
  await assert.rejects(download(store, { ...ref, size: ref.size + 1 }), /not as its post describes/)
  store.lose(ref.chunks![1])
  await assert.rejects(download(store, ref), /no longer have/)
})

test('no storage server: the upload says so', async () => {
  const none: BlobStore = { put: async () => 0, get: async () => null }
  await assert.rejects(upload(none, bytesOf(10), { kind: 'image', type: 'image/png' }), /No storage server/)
})

test('pictures are made to fit, never made larger', () => {
  assert.deepEqual(fit(3200, 1600), { w: 1600, h: 800 })
  assert.deepEqual(fit(1000, 4000), { w: 400, h: 1600 })
  assert.deepEqual(fit(640, 480), { w: 640, h: 480 })
})

test('only http(s) addresses in text become links', () => {
  assert.deepEqual(withLinks('see https://peer.ooo/x?a=1. ok'), [{ text: 'see ' }, { text: 'https://peer.ooo/x?a=1', href: 'https://peer.ooo/x?a=1' }, { text: '. ok' }])
  assert.deepEqual(withLinks('javascript:alert(1) and plain'), [{ text: 'javascript:alert(1) and plain' }])
  assert.deepEqual(withLinks(''), [])
})
