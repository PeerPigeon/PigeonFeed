/** Pages and their addresses (composables/useRoute.ts keeps the page showing in step with the address). */
import { isSigner } from './records'

export type View = 'feed' | 'friends' | 'messages' | 'profile'
export interface Route { view: View; who: string | null }

export function parseRoute(path: string): Route {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/friends') return { view: 'friends', who: null }
  if (p === '/messages') return { view: 'messages', who: null }
  const m = /^\/u\/([^/]+)$/.exec(p)
  if (m) {
    const who = decodeURIComponent(m[1])
    if (isSigner(who)) return { view: 'profile', who }
  }
  return { view: 'feed', who: null }
}

export function routePath(r: Route): string {
  if (r.view === 'profile' && r.who) return `/u/${encodeURIComponent(r.who)}`
  if (r.view === 'friends') return '/friends'
  if (r.view === 'messages') return '/messages'
  return '/'
}
