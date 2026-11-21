import test from 'node:test'
import assert from 'node:assert/strict'
import {
  K, ago, convId, displayName, followKey, friendsOf, likeKey, messageKey, parseFollow, parseLike, parseMedia, parseMessage, parsePost,
  parseProfile, postKey, profileKey, settlePosts, stamp, type Post,
} from '../src/utils/records.ts'

// Signing keys as unsea makes them: two base64url halves joined by a dot.
const A = 'eraX0MMq_F_X90IMe0ge4wlMDMtJKR1ht1ZKQIzwZXY.l6q3EaMwXfbDbpfliIbSAoicPJHEdkPNN1TiRVBif_4'
const B = 'Zq1X0MMq_F_X90IMe0ge4wlMDMtJKR1ht1ZKQIzwZXY.m7q3EaMwXfbDbpfliIbSAoicPJHEdkPNN1TiRVBif_4'
const C = 'Aa1X0MMq_F_X90IMe0ge4wlMDMtJKR1ht1ZKQIzwZXY.n8q3EaMwXfbDbpfliIbSAoicPJHEdkPNN1TiRVBif_4'
const NOW = 1_800_000_000_000
const HASH = 'ab'.repeat(32)

test('stamps sort by time as text', () => {
  assert.ok(stamp(1000) < stamp(2000))
  assert.ok(stamp(NOW) < stamp(NOW + 1))
  assert.match(postKey(NOW), /^pf\/p\/[0-9a-z]{9}-[0-9a-z]{6}$/)
})

test('a post: its text and when, from whoever signed it', () => {
  const key = postKey(NOW)
  const p = parsePost({ key, signer: A, value: { text: '  hello  ', at: NOW } }, NOW)
  assert.deepEqual(p, { key, id: key.slice(K.post.length), signer: A, text: 'hello', at: NOW, media: [] })
  assert.equal(parsePost({ key, signer: null, value: { text: 'x', at: NOW } }, NOW), null, 'unsigned')
  assert.equal(parsePost({ key, signer: A, value: { text: '   ', at: NOW } }, NOW), null, 'empty')
  assert.equal(parsePost({ key, signer: A, value: { text: 'x', at: NOW + 3_600_000 } }, NOW), null, 'dated an hour ahead')
  assert.equal(parsePost({ key: 'pf/x/1', signer: A, value: { text: 'x', at: NOW } }, NOW), null, 'not a post key')
  assert.equal(parsePost({ key, signer: A, value: { text: 'x'.repeat(5000), at: NOW } }, NOW)!.text.length, 2000)
})

test('a reply names the post it answers; a post with only a picture counts', () => {
  const parent = postKey(NOW - 1000)
  const reply = parsePost({ key: postKey(NOW), signer: B, value: { text: 'yes', at: NOW, re: parent } }, NOW)
  assert.equal(reply!.re, parent)
  assert.equal(parsePost({ key: postKey(NOW), signer: B, value: { text: 'yes', at: NOW, re: 'elsewhere' } }, NOW)!.re, undefined)
  const media = { kind: 'image', type: 'image/jpeg', size: 1000, w: 800, h: 600, chunks: [HASH] }
  const pic = parsePost({ key: postKey(NOW), signer: A, value: { text: '', at: NOW, media: [media, { kind: 'image' }] } }, NOW)
  assert.deepEqual(pic!.media, [media])
})

test('media: pieces by hash, or one piece that lists them', () => {
  assert.equal(parseMedia({ kind: 'video', type: 'video/mp4', size: 5e6, list: HASH })!.list, HASH)
  assert.equal(parseMedia({ kind: 'video', type: 'image/png', size: 5, chunks: [HASH] }), null, 'kind and type disagree')
  assert.equal(parseMedia({ kind: 'image', type: 'image/png', size: 5, chunks: ['nope'] }), null, 'not a hash')
  assert.equal(parseMedia({ kind: 'image', type: 'image/png', size: 0, chunks: [HASH] }), null, 'no size')
})

test('likes, profiles and friend requests count only from the signer their key names', () => {
  const post = postKey(NOW)
  assert.deepEqual(parseLike({ key: likeKey(A, post), signer: A, value: { at: NOW } }), { signer: A, post })
  assert.equal(parseLike({ key: likeKey(A, post), signer: B, value: { at: NOW } }), null, "B can't like as A")

  const profile = { name: '  Ann   Lee ', bio: 'hi', epub: 'x.y', at: NOW }
  assert.equal(parseProfile({ key: profileKey(A), signer: A, value: profile }, NOW)!.name, 'Ann Lee')
  assert.equal(parseProfile({ key: profileKey(A), signer: B, value: profile }, NOW), null, "B can't describe A")
  assert.equal(parseProfile({ key: profileKey(A), signer: A, value: { name: 'Ann' } }, NOW), null, 'no key to write to')

  assert.deepEqual(parseFollow({ key: followKey(A, B), signer: A, value: { at: NOW } }), { from: A, to: B })
  assert.equal(parseFollow({ key: followKey(A, B), signer: B, value: { at: NOW } }), null, "B can't ask as A")
  assert.equal(parseFollow({ key: followKey(A, A), signer: A, value: { at: NOW } }), null, 'nobody befriends themselves')
})

test('friends are both ways round; one way is a request or one sent', () => {
  const wants = [`${A}>${B}`, `${B}>${A}`, `${C}>${A}`, `${B}>${C}`]
  assert.deepEqual(friendsOf(A, wants), { friends: [B], requests: [C], sent: [] })
  assert.deepEqual(friendsOf(B, wants), { friends: [A], requests: [], sent: [C] })
  assert.deepEqual(friendsOf(C, wants), { friends: [], requests: [B], sent: [A] })
})

test('a private message belongs to the two people its key names', () => {
  assert.equal(convId(A, B), convId(B, A))
  const key = messageKey(A, B, NOW)
  const value = { to: B, at: NOW, a: { ciphertext: 'c' }, b: { ciphertext: 'd' } }
  const m = parseMessage({ key, signer: A, value }, NOW)!
  assert.equal(m.from, A)
  assert.equal(m.to, B)
  assert.equal(m.conv, convId(A, B))
  assert.equal(parseMessage({ key, signer: C, value }, NOW), null, 'written by someone outside the conversation')
  assert.equal(parseMessage({ key, signer: A, value: { ...value, to: C } }, NOW), null, 'addressed to someone else')
  assert.equal(parseMessage({ key, signer: A, value: { to: B, at: NOW, a: 'plain', b: 'plain' } }, NOW), null, 'not encrypted')
})

test('the feed: newest first, the muted left out, a flood cut short', () => {
  const mk = (signer: string, at: number): Post => ({ key: postKey(at), id: '', signer, text: 't', at, media: [] })
  const flood = Array.from({ length: 15 }, (_, i) => mk(B, NOW + i * 1000))
  const posts = [mk(A, NOW - 5000), ...flood, mk(C, NOW + 500), mk(A, NOW + 90_000)]
  const shown = settlePosts(posts, new Set([C]))
  assert.equal(shown[0].at, NOW + 90_000, 'newest first')
  assert.ok(!shown.some((p) => p.signer === C), 'muted')
  assert.equal(shown.filter((p) => p.signer === B).length, 10, 'at most 10 a minute from one writer')
  assert.equal(shown.filter((p) => p.signer === A).length, 2)
})

test('names and times, as shown', () => {
  assert.equal(displayName(undefined, A), 'Guest · eraX0')
  assert.equal(displayName({ signer: A, name: 'Ann', bio: '', epub: 'x', at: 0 }, A), 'Ann · eraX0')
  assert.equal(displayName({ signer: A, name: 'Ann', bio: '', epub: 'x', at: 0 }, A, 'ann'), 'ann', 'a checked account name stands alone')
  assert.equal(ago(NOW - 10_000, NOW), 'now')
  assert.equal(ago(NOW - 5 * 60_000, NOW), '5 min')
  assert.equal(ago(NOW - 3 * 3_600_000, NOW), '3 h')
})
