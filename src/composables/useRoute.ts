/**
 * Which page is showing, as its address: / (the feed), /friends, /messages, and /u/<key> (a person's
 * profile), so a profile can be shared and the browser's Back and Forward move between pages. The page's
 * query (?signal=… for a relay of one's own) is kept on every address. The host serves the app for any
 * path (wrangler.jsonc: single-page-application).
 */
import { ref } from 'vue'

export { parseRoute, routePath, type Route, type View } from '@/utils/route'
import { parseRoute, routePath, type Route } from '@/utils/route'

const route = ref<Route>(parseRoute(location.pathname))

/** Go to a page: a new entry in the browser's history (none when it is the page already showing). */
export function navigate(next: Route): void {
  const path = routePath(next)
  if (path !== location.pathname) history.pushState(null, '', `${path}${location.search}`)
  route.value = next
  window.scrollTo({ top: 0 })
}

/** A person's profile. */
export const openProfile = (who: string): void => navigate({ view: 'profile', who })
/** The address of a person's profile, as a link has it. */
export const profileHref = (who: string): string => `${routePath({ view: 'profile', who })}${location.search}`

window.addEventListener('popstate', () => { route.value = parseRoute(location.pathname) })

export function useRoute() {
  return { route }
}
