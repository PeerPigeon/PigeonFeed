/**
 * PigeonFeed's records. Everything a person does is a record in the room's storage (PeerPigeon's 'user'
 * space), signed by its writer: their account's key once signed in, else this browser's own. Every peer
 * in the room keeps them (the keys below are replicated in full) and so do the storage servers (PigeonFS),
 * so a page that arrives sees what was written while it was away.
 *
 *   pf/p/<stamp>                 a post, or a reply (`re`: the post it answers)
 *   pf/l/<signer>/<post id>      that signer likes the post
 *   pf/u/<signer>                that signer's profile: a name, and the keys to write to them privately
 *   pf/f/<signer>/<other>        that signer wants <other> as a friend; both ways round: friends
 *   pf/m/<a>~<b>/<stamp>         a private message between a and b (sorted), encrypted to each of them
 *
 * A record counts only when the key that signed it is the signer its key names: nobody likes, befriends
 * or describes themselves in someone else's name.
 */

export const FEED_KEYS = 'pf/'
export const K = { post: 'pf/p/', like: 'pf/l/', profile: 'pf/u/', follow: 'pf/f/', message: 'pf/m/' } as const

export const MAX_TEXT = 2000
export const MAX_NAME = 40
export const MAX_BIO = 200
export const MAX_MEDIA = 4
/** A date further ahead than this is a wrong clock (or a post trying to stay on top): left out. */
const AHEAD_MS = 5 * 60_000
/** A writer's posts beyond RATE in RATE_MS are left out. */
export const RATE = 10
export const RATE_MS = 60_000

/** A record as storage hands it over (only what is read here). */
export interface Rec { key: string; signer?: string | null; value?: unknown }

/** A file kept on the storage servers in pieces: each piece by its SHA-256, or (many pieces) a piece that lists them. */
export interface MediaRef {
  kind: 'image' | 'video'
  type: string
  size: number
  name?: string
  w?: number
  h?: number
  /** The pieces, in order. */
  chunks?: string[]
  /** Or: the piece that lists them, one hash a line. */
  list?: string
}

export interface Post { key: string; id: string; signer: string; text: string; at: number; media: MediaRef[]; re?: string }
export interface Profile { signer: string; name: string; bio: string; epub: string; kpub?: string; account?: string; at: number }
export interface Message { key: string; conv: string; from: string; to: string; at: number; /** Encrypted to `to`, and to `from`. */ forTo: unknown; forFrom: unknown }

const rand = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0')
/** Sorts by time as text: 9 base-36 digits (until the year 5188), then a few random ones. */
export const stamp = (now = Date.now()) => `${Math.floor(now).toString(36).padStart(9, '0')}-${rand()}`

/** A signing key as it appears in keys: base64url halves joined by a dot. */
export const isSigner = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{20,100}\.[\w-]{20,100}$/.test(s)
const HASH = /^[0-9a-f]{64}$/

export const postKey = (now = Date.now()) => `${K.post}${stamp(now)}`
export const postId = (key: string) => key.slice(K.post.length)
export const likeKey = (me: string, post: string) => `${K.like}${me}/${postId(post)}`
export const profileKey = (me: string) => `${K.profile}${me}`
export const followKey = (me: string, other: string) => `${K.follow}${me}/${other}`
export const convId = (a: string, b: string) => [a, b].sort().join('~')
export const messageKey = (a: string, b: string, now = Date.now()) => `${K.message}${convId(a, b)}/${stamp(now)}`

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const time = (v: unknown, now: number): number | null => {
  const at = Number(v)
  return Number.isFinite(at) && at > 0 && at <= now + AHEAD_MS ? at : null
}

export function parseMedia(v: unknown): MediaRef | null {
  const m = obj(v)
  if (!m || (m.kind !== 'image' && m.kind !== 'video') || typeof m.type !== 'string' || !m.type.startsWith(`${m.kind}/`)) return null
  const size = Number(m.size)
  if (!Number.isFinite(size) || size <= 0) return null
  const chunks = Array.isArray(m.chunks) && m.chunks.length > 0 && m.chunks.length <= 64 && m.chunks.every((h) => typeof h === 'string' && HASH.test(h)) ? m.chunks as string[] : null
  const list = typeof m.list === 'string' && HASH.test(m.list) ? m.list : null
  if (!chunks && !list) return null
  const side = (x: unknown) => (Number.isFinite(Number(x)) && Number(x) > 0 && Number(x) < 20000 ? Math.round(Number(x)) : undefined)
  return {
    kind: m.kind, type: m.type.slice(0, 60), size,
    ...(typeof m.name === 'string' ? { name: m.name.slice(0, 120) } : {}),
    ...(side(m.w) && side(m.h) ? { w: side(m.w), h: side(m.h) } : {}),
    ...(chunks ? { chunks } : { list: list! }),
  }
}

export function parsePost(r: Rec, now = Date.now()): Post | null {
  const v = obj(r.value)
  if (!r.key.startsWith(K.post) || !v || !isSigner(r.signer)) return null
  const at = time(v.at, now)
  if (at === null || typeof v.text !== 'string') return null
  const media = (Array.isArray(v.media) ? v.media : []).slice(0, MAX_MEDIA).map(parseMedia).filter((m): m is MediaRef => !!m)
  const text = v.text.slice(0, MAX_TEXT).trim()
  if (!text && !media.length) return null
  const re = typeof v.re === 'string' && v.re.startsWith(K.post) && v.re.length < 80 ? v.re : undefined
  return { key: r.key, id: postId(r.key), signer: r.signer, text, at, media, ...(re ? { re } : {}) }
}

/** { signer, post }: the post's key. */
export function parseLike(r: Rec): { signer: string; post: string } | null {
  if (!r.key.startsWith(K.like) || !isSigner(r.signer) || !r.value) return null
  const rest = r.key.slice(K.like.length)
  if (!rest.startsWith(`${r.signer}/`)) return null
  const id = rest.slice(r.signer.length + 1)
  return id && !id.includes('/') ? { signer: r.signer, post: `${K.post}${id}` } : null
}

export function parseProfile(r: Rec, now = Date.now()): Profile | null {
  const v = obj(r.value)
  if (r.key !== profileKey(String(r.signer)) || !v || !isSigner(r.signer)) return null
  if (typeof v.epub !== 'string' || v.epub.length > 200) return null
  return {
    signer: r.signer,
    name: (typeof v.name === 'string' ? v.name : '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME),
    bio: (typeof v.bio === 'string' ? v.bio : '').trim().slice(0, MAX_BIO),
    epub: v.epub,
    ...(typeof v.kpub === 'string' && v.kpub.length < 4000 ? { kpub: v.kpub } : {}),
    ...(typeof v.account === 'string' && v.account.length <= MAX_NAME ? { account: v.account } : {}),
    at: time(v.at, now) ?? 0,
  }
}

/** { from, to }: `from` wants `to` as a friend. */
export function parseFollow(r: Rec): { from: string; to: string } | null {
  if (!r.key.startsWith(K.follow) || !isSigner(r.signer) || !r.value) return null
  const rest = r.key.slice(K.follow.length)
  if (!rest.startsWith(`${r.signer}/`)) return null
  const to = rest.slice(r.signer.length + 1)
  return isSigner(to) && to !== r.signer ? { from: r.signer, to } : null
}

export function parseMessage(r: Rec, now = Date.now()): Message | null {
  const v = obj(r.value)
  if (!r.key.startsWith(K.message) || !v || !isSigner(r.signer)) return null
  const [conv, id, ...more] = r.key.slice(K.message.length).split('/')
  if (!conv || !id || more.length) return null
  const pair = conv.split('~')
  if (pair.length !== 2 || !pair.every(isSigner) || convId(pair[0], pair[1]) !== conv || !pair.includes(r.signer)) return null
  const to = pair[0] === r.signer ? pair[1] : pair[0]
  const at = time(v.at, now)
  if (at === null || v.to !== to || !obj(v.a) || !obj(v.b)) return null
  return { key: r.key, conv, from: r.signer, to, at, forTo: v.a, forFrom: v.b }
}

/** The posts to show, newest first: the muted left out, and a writer's beyond RATE in RATE_MS. */
export function settlePosts(all: Post[], muted: ReadonlySet<string> = new Set()): Post[] {
  const sorted = all.filter((p) => !muted.has(p.signer)).sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : 1))
  const recent = new Map<string, number[]>()
  const kept: Post[] = []
  for (const p of sorted) {
    const times = (recent.get(p.signer) ?? []).filter((t) => p.at - t < RATE_MS)
    if (times.length >= RATE) continue
    times.push(p.at)
    recent.set(p.signer, times)
    kept.push(p)
  }
  return kept.reverse()
}

/**
 * Friends, from who wants whom (`wants`: "from>to"): both ways round is a friend; only they want me, a
 * request to answer; only I want them, one I sent.
 */
export function friendsOf(me: string, wants: Iterable<string>): { friends: string[]; requests: string[]; sent: string[] } {
  const mine = new Set<string>(), theirs = new Set<string>()
  for (const w of wants) {
    const [from, to] = w.split('>')
    if (from === me) mine.add(to)
    else if (to === me) theirs.add(from)
  }
  return {
    friends: [...mine].filter((x) => theirs.has(x)).sort(),
    requests: [...theirs].filter((x) => !mine.has(x)).sort(),
    sent: [...mine].filter((x) => !theirs.has(x)).sort(),
  }
}

/** A name to show: the profile's, else "Guest"; with a few characters of the key for anyone not on an account. */
export function displayName(profile: Profile | undefined, signer: string, verifiedAccount: string | null = null): string {
  if (verifiedAccount) return verifiedAccount
  return `${profile?.name || 'Guest'} · ${signer.slice(0, 5)}`
}

/** "now", "5 min", "3 h", "Nov 4": how long ago, as a feed says it. */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, now - at) / 1000
  if (s < 45) return 'now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  const d = new Date(at)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) })
}
