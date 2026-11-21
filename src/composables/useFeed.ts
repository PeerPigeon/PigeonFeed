/**
 * The feed's state: every record under pf/ in the room's storage (utils/records.ts), read once when the
 * mesh is up and kept up to date from its changes. Posts, likes, profiles, friends and private messages
 * are all views of that one set. Writing is a put (or a delete) signed by whoever this page is.
 */
import { computed, ref, shallowRef, triggerRef } from 'vue'
import * as unsea from 'unsea'
import type { PeerPigeonStorage } from 'peerpigeon'
import { blobs } from './useMesh'
import { useIdentity, verifiedAccount } from './useIdentity'
import {
  FEED_KEYS, K, MAX_BIO, MAX_NAME, MAX_TEXT, convId, displayName, followKey, friendsOf, likeKey, messageKey, parseFollow, parseLike,
  parseMessage, parsePost, parseProfile, postKey, profileKey, settlePosts,
  type MediaRef, type Message, type Post, type Profile, type Rec,
} from '@/utils/records'
import { download } from '@/utils/media'

const { keys, signer, account } = useIdentity()

let store: PeerPigeonStorage | null = null
let unsubscribe: (() => void) | null = null
const loaded = ref(false)

// Every record that counts, by key. Plain maps, with one signal for the views that read them.
const state = shallowRef({
  posts: new Map<string, Post>(),
  likes: new Map<string, { signer: string; post: string }>(),
  profiles: new Map<string, Profile>(),
  wants: new Map<string, string>(), // key -> "from>to"
  messages: new Map<string, Message>(),
})
const changed = () => triggerRef(state)

function take(r: Rec): boolean {
  const s = state.value
  if (r.key.startsWith(K.post)) { const p = parsePost(r); if (p) s.posts.set(r.key, p); return !!p }
  if (r.key.startsWith(K.like)) { const l = parseLike(r); if (l) s.likes.set(r.key, l); return !!l }
  if (r.key.startsWith(K.profile)) { const p = parseProfile(r); if (p) s.profiles.set(r.key, p); return !!p }
  if (r.key.startsWith(K.follow)) { const f = parseFollow(r); if (f) s.wants.set(r.key, `${f.from}>${f.to}`); return !!f }
  if (r.key.startsWith(K.message)) { const m = parseMessage(r); if (m) s.messages.set(r.key, m); return !!m }
  return false
}
function drop(key: string): void {
  const s = state.value
  for (const map of [s.posts, s.likes, s.profiles, s.wants, s.messages] as Map<string, unknown>[]) map.delete(key)
}

/** Start on the room's storage: what it holds now, then its changes. */
export async function startFeed(s: PeerPigeonStorage): Promise<void> {
  unsubscribe?.()
  store = s
  for (const r of await s.list('user').catch(() => [])) if (r.key.startsWith(FEED_KEYS)) take(r as Rec)
  loaded.value = true
  changed()
  unsubscribe = s.subscribe((e) => {
    if (e.space !== 'user' || !e.key.startsWith(FEED_KEYS)) return
    if (e.op === 'delete') { drop(e.key); changed(); return }
    // A change says who signed the record only sometimes (not for a write here): read it back for that.
    void (async () => {
      const rec = typeof e.record?.signer === 'string' ? e.record : await s.get('user', e.key).catch(() => null)
      if (rec && store === s && take(rec as Rec)) changed()
    })()
  })
  void publishProfile()
}

// ------------------------------------------------------------ who is who

const NAME_KEY = 'pigeonfeed:name'
/** The name a person without an account goes by (kept on this device). */
const guestName = ref((() => { try { return localStorage.getItem(NAME_KEY) ?? '' } catch { return '' } })())
const bio = ref((() => { try { return localStorage.getItem('pigeonfeed:bio') ?? '' } catch { return '' } })())

const profileOf = (who: string): Profile | undefined => state.value.profiles.get(profileKey(who))
/** A person's name as shown: an account's name when it is theirs, else their own with a bit of their key. */
export const nameOf = (who: string): string => {
  const p = profileOf(who)
  return displayName(p, who, verifiedAccount(who, p?.account))
}
/** Whether that name is an account's (checked against the account's record). */
export const isAccount = (who: string): boolean => !!verifiedAccount(who, profileOf(who)?.account)

/** Say who this page is: its name, and the keys to write to it privately. Written when it changes. */
export async function publishProfile(): Promise<void> {
  const k = keys.value
  if (!store || !k || store.signer() !== k.pub) return
  const name = (account.value?.alias ?? guestName.value).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  const mine = profileOf(k.pub)
  const next = { name, bio: bio.value.trim().slice(0, MAX_BIO), epub: k.epub, ...(k.kpub ? { kpub: k.kpub } : {}), ...(account.value ? { account: account.value.alias } : {}) }
  if (mine && mine.name === next.name && mine.bio === next.bio && mine.epub === next.epub && mine.kpub === next.kpub && mine.account === next.account) return
  await store.put('user', profileKey(k.pub), { ...next, at: Date.now() }).catch((e) => console.warn('Could not publish the profile:', e))
}

export async function setProfile(name: string, about: string): Promise<void> {
  guestName.value = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  bio.value = about.trim().slice(0, MAX_BIO)
  try { localStorage.setItem(NAME_KEY, guestName.value); localStorage.setItem('pigeonfeed:bio', bio.value) } catch { /* not kept */ }
  await publishProfile()
}

// ------------------------------------------------------------ posts

const MUTED_KEY = 'pigeonfeed:muted'
const muted = ref<Set<string>>((() => { try { return new Set<string>(JSON.parse(localStorage.getItem(MUTED_KEY) || '[]')) } catch { return new Set<string>() } })())
export function setMuted(who: string, on: boolean): void {
  const next = new Set(muted.value)
  if (on) next.add(who); else next.delete(who)
  muted.value = next
  try { localStorage.setItem(MUTED_KEY, JSON.stringify([...next])) } catch { /* not kept */ }
}

const settled = computed(() => settlePosts([...state.value.posts.values()], muted.value))
/** The feed: posts that answer nothing, newest first. */
const posts = computed(() => settled.value.filter((p) => !p.re))
/** Each post's replies, oldest first. */
const replies = computed(() => {
  const by = new Map<string, Post[]>()
  for (const p of settled.value) if (p.re) by.set(p.re, [p, ...(by.get(p.re) ?? [])])
  return by
})
/** Who likes each post. */
const likes = computed(() => {
  const by = new Map<string, Set<string>>()
  for (const l of state.value.likes.values()) {
    if (muted.value.has(l.signer)) continue
    let set = by.get(l.post)
    if (!set) by.set(l.post, (set = new Set()))
    set.add(l.signer)
  }
  return by
})

const need = (): { s: PeerPigeonStorage; me: string } => {
  const me = signer.value
  if (!store || !me) throw new Error('Not connected yet')
  // Storage signs as the account a moment after signing in: never write one person's record as another.
  if (store.signer() !== me) throw new Error('Still signing in: try again in a moment')
  return { s: store, me }
}

// At most RATE posts a minute are shown for one writer (utils/records.ts): the same is kept to here.
const sentAt: number[] = []
export async function post(text: string, media: MediaRef[] = [], re?: string): Promise<void> {
  const { s } = need()
  const t = text.trim().slice(0, MAX_TEXT)
  if (!t && !media.length) throw new Error('Nothing to post')
  const now = Date.now()
  while (sentAt.length && now - sentAt[0] > 60_000) sentAt.shift()
  if (sentAt.length >= 10) throw new Error('A moment, please: at most 10 posts a minute')
  sentAt.push(now)
  await publishProfile()
  await s.put('user', postKey(now), { text: t, at: now, ...(media.length ? { media: JSON.parse(JSON.stringify(media)) } : {}), ...(re ? { re } : {}) })
}

export async function removePost(key: string): Promise<void> {
  const { s, me } = need()
  if (state.value.posts.get(key)?.signer !== me) return
  await s.delete('user', key)
}

export async function setLike(postKeyOf: string, on: boolean): Promise<void> {
  const { s, me } = need()
  if (on) await s.put('user', likeKey(me, postKeyOf), { at: Date.now() })
  else await s.delete('user', likeKey(me, postKeyOf))
}

// ------------------------------------------------------------ friends

const circle = computed(() => (signer.value ? friendsOf(signer.value, state.value.wants.values()) : { friends: [], requests: [], sent: [] }))
/** Everyone who has said who they are here, but this page: by name. */
const people = computed(() => [...state.value.profiles.values()].filter((p) => p.signer !== signer.value && !muted.value.has(p.signer)).sort((a, b) => b.at - a.at))

/** Ask someone to be a friend, or accept their asking (the same record, from this side). */
export async function befriend(other: string): Promise<void> {
  const { s, me } = need()
  await publishProfile()
  await s.put('user', followKey(me, other), { at: Date.now() })
}
/** Take back a request, or stop being friends (this side's record goes). */
export async function unfriend(other: string): Promise<void> {
  const { s, me } = need()
  await s.delete('user', followKey(me, other))
}

// ------------------------------------------------------------ private messages

/** A message as read here: its text once opened ('' until then; null: could not be opened with these keys). */
export interface Opened { key: string; from: string; to: string; at: number; mine: boolean; text: string | null }
const opened = ref(new Map<string, string | null>())
const opening = new Set<string>()

function open(m: Message, k: NonNullable<typeof keys.value>): void {
  const id = `${k.pub}|${m.key}`
  if (opening.has(id) || opened.value.has(id)) return
  opening.add(id)
  void unsea.decryptMessageWithMeta(m.from === k.pub ? m.forFrom : m.forTo, k as unsea.KeyPair)
    .then((text) => String(text).slice(0, MAX_TEXT), () => null)
    .then((text) => {
      opening.delete(id)
      const next = new Map(opened.value)
      next.set(id, text)
      opened.value = next
    })
}

/** This page's conversations: the other person, their messages oldest first. */
const conversations = computed(() => {
  const k = keys.value
  const by = new Map<string, Opened[]>()
  if (!k) return by
  for (const m of state.value.messages.values()) {
    if (m.from !== k.pub && m.to !== k.pub) continue
    const other = m.from === k.pub ? m.to : m.from
    if (muted.value.has(other)) continue
    open(m, k)
    const text = opened.value.get(`${k.pub}|${m.key}`)
    let list = by.get(other)
    if (!list) by.set(other, (list = []))
    list.push({ key: m.key, from: m.from, to: m.to, at: m.at, mine: m.from === k.pub, text: text === undefined ? '' : text })
  }
  for (const list of by.values()) list.sort((a, b) => a.at - b.at)
  return by
})

const READ_KEY = 'pigeonfeed:read'
/** When each conversation was last looked at (kept on this device). */
const readAt = ref<Record<string, number>>((() => { try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}') } catch { return {} } })())
export function markRead(other: string): void {
  const me = signer.value
  if (!me) return
  readAt.value = { ...readAt.value, [convId(me, other)]: Date.now() }
  try { localStorage.setItem(READ_KEY, JSON.stringify(readAt.value)) } catch { /* not kept */ }
}
const unreadIn = (other: string): number => {
  const me = signer.value
  if (!me) return 0
  const since = readAt.value[convId(me, other)] ?? 0
  return (conversations.value.get(other) ?? []).filter((m) => !m.mine && m.at > since).length
}
const unread = computed(() => [...conversations.value.keys()].reduce((n, other) => n + unreadIn(other), 0))

/** Whether a private message can be written to them (they have said which keys to write to). */
export const canMessage = (other: string): boolean => !!profileOf(other)?.epub

/**
 * A private message: encrypted to their keys and, so this page can read what it sent, to its own (unsea:
 * P-256, with ML-KEM-768 too when the keys have it). Who wrote to whom, and when, is not hidden.
 */
export async function sendMessage(other: string, text: string): Promise<void> {
  const { s, me } = need()
  const k = keys.value!
  const t = text.trim().slice(0, MAX_TEXT)
  if (!t) return
  const them = profileOf(other)
  if (!them?.epub) throw new Error("They haven't been here on this version yet: no keys to write to")
  await publishProfile()
  const now = Date.now()
  const [a, b] = await Promise.all([
    unsea.encryptMessageWithMeta(t, { epub: them.epub, ...(them.kpub ? { kpub: them.kpub } : {}) }),
    unsea.encryptMessageWithMeta(t, { epub: k.epub, ...(k.kpub ? { kpub: k.kpub } : {}) }),
  ])
  await s.put('user', messageKey(me, other, now), { to: other, at: now, a, b })
  markRead(other)
}

// ------------------------------------------------------------ media

const urls = new Map<string, Promise<string>>()
/** A posted file as an address this page can show (fetched once from the storage servers, then kept while the page is open). */
export function mediaUrl(ref: MediaRef, progress?: (done: number) => void): Promise<string> {
  const id = ref.list ?? ref.chunks!.join('')
  let url = urls.get(id)
  if (!url) {
    url = download(blobs, ref, progress).then((bytes) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: ref.type })))
    url.catch(() => urls.delete(id))
    urls.set(id, url)
  }
  return url
}

export function useFeed() {
  return { loaded, posts, replies, likes, muted, circle, people, conversations, unread, unreadIn, guestName, bio }
}
