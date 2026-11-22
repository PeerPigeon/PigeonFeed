import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRoute, routePath } from '../src/utils/route.ts'

const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345678_-ab.ZyXwVuTsRqPoNmLkJiHgFeDcBa98765-_43'

test('each page has its address, and back', () => {
  for (const r of [{ view: 'feed', who: null }, { view: 'friends', who: null }, { view: 'messages', who: null }, { view: 'profile', who: KEY }] as const) {
    assert.deepEqual(parseRoute(routePath(r)), r)
  }
  assert.equal(routePath({ view: 'profile', who: KEY }), `/u/${KEY}`)
})

test('an address that is not a page, or a key that is not one, is the feed', () => {
  assert.deepEqual(parseRoute('/'), { view: 'feed', who: null })
  assert.deepEqual(parseRoute('/hello'), { view: 'feed', who: null })
  assert.deepEqual(parseRoute('/u/not-a-key'), { view: 'feed', who: null })
  assert.deepEqual(parseRoute('/u/'), { view: 'feed', who: null })
  assert.deepEqual(parseRoute('/friends/'), { view: 'friends', who: null })
  assert.deepEqual(parseRoute(`/u/${encodeURIComponent(KEY)}/`), { view: 'profile', who: KEY })
})
