<template>
  <div class="app">
    <header class="topbar">
      <button type="button" class="brand" title="Feed" aria-label="PigeonFeed, the feed" @click="go('feed')">
        <img src="/pigeonlogo.svg" alt="" class="brand-mark" />
        <span class="wordmark">PigeonFeed</span>
      </button>

      <p class="net" :class="statusClass" role="status">
        <span class="net-dot" aria-hidden="true" :title="statusText"></span>
        <span class="net-text">{{ statusText }}</span>
        <span v-if="connected" class="net-peers">{{ online }} online</span>
      </p>

      <nav class="nav" :class="{ open: showMenu }" aria-label="Pages">
        <button class="nav-link" :class="{ on: view === 'feed' }" @click="go('feed')">Feed</button>
        <button class="nav-link" :class="{ on: view === 'friends' }" @click="go('friends')">
          Friends<span v-if="circle.requests.length" class="badge" :aria-label="`${circle.requests.length} requests`">{{ circle.requests.length }}</span>
        </button>
        <button class="nav-link" :class="{ on: view === 'messages' }" @click="go('messages')">
          Messages<span v-if="unread" class="badge" :aria-label="`${unread} unread`">{{ unread }}</span>
        </button>
        <button class="nav-link nav-login" :class="{ on: view === 'profile' && route.who === signer }" @click="openOwnProfile">{{ account ? account.alias : (guestName || 'You') }}</button>
      </nav>
      <button
        type="button" class="theme-switch"
        :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" :title="theme === 'dark' ? 'Light mode' : 'Dark mode'"
        @click="setTheme(theme === 'dark' ? 'light' : 'dark')"
      >
        <svg v-if="theme === 'dark'" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
      </button>
      <button class="menu-toggle" :aria-expanded="showMenu" :aria-label="showMenu ? 'Close menu' : 'Menu'" @click="showMenu = !showMenu">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path v-if="showMenu" d="M6 6l12 12M18 6L6 18" />
          <path v-else d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </header>

    <main class="main" :class="view">
      <!-- The feed -->
      <section v-if="view === 'feed'" class="column">
        <div class="card"><Composer /></div>

        <div class="scope" role="radiogroup" aria-label="Whose posts">
          <button type="button" role="radio" class="scope-option" :class="{ picked: scope === 'all' }" :aria-checked="scope === 'all'" @click="scope = 'all'">Everyone</button>
          <button type="button" role="radio" class="scope-option" :class="{ picked: scope === 'friends' }" :aria-checked="scope === 'friends'" @click="scope = 'friends'">Friends</button>
        </div>

        <p v-if="meshError" class="alert" role="alert">Could not connect: {{ meshError }}. <button class="btn btn-quiet" @click="retry">Try again</button></p>
        <p v-else-if="!loaded" class="hint" role="status">Connecting to the mesh…</p>
        <p v-else-if="!shown.length" class="hint">
          {{ scope === 'friends' ? (circle.friends.length ? 'Your friends have not posted yet.' : 'No friends yet: add some on the Friends page.') : 'Nothing here yet. Write the first post.' }}
        </p>
        <PostCard v-for="p in shown" :key="p.key" :post="p" :now="now" @message="openMessages" />
        <button v-if="all.length > shown.length" class="btn btn-wide" @click="limit += 50">Show older posts</button>
      </section>

      <section v-else-if="view === 'friends'" class="column">
        <FriendsView @message="openMessages" />
      </section>

      <section v-else-if="view === 'profile' && route.who" class="column">
        <ProfileView :who="route.who" :now="now" @message="openMessages" @account="showAccount = true" />
      </section>

      <section v-else class="wide">
        <MessagesView :other="chatWith" :now="now" @pick="(who) => (chatWith = who)" />
      </section>
    </main>

    <footer v-if="view !== 'messages'" class="build-footer">
      PigeonFeed {{ build }} · peer to peer on <a href="https://github.com/PeerPigeon/PeerPigeon" target="_blank" rel="noopener">PeerPigeon</a>{{ relay ? ` · ${/relay/.test(relay) ? relay : `relay ${relay}`}` : '' }}
    </footer>

    <AccountSheet v-if="showAccount" @close="showAccount = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AccountSheet from './components/AccountSheet.vue'
import Composer from './components/Composer.vue'
import FriendsView from './components/FriendsView.vue'
import MessagesView from './components/MessagesView.vue'
import PostCard from './components/PostCard.vue'
import ProfileView from './components/ProfileView.vue'
import { navigate, openProfile, useRoute, type View } from './composables/useRoute'
import { startMesh, storage, useMesh } from './composables/useMesh'
import { initIdentity, useIdentity } from './composables/useIdentity'
import { publishProfile, startFeed, useFeed } from './composables/useFeed'

declare const __BUILD__: string
const build = __BUILD__

const { connected, starting, error: meshError, online, relay } = useMesh()
const { account, signer } = useIdentity()
const { loaded, posts, circle, unread, guestName } = useFeed()

// The page showing is the address's (composables/useRoute.ts): Back and Forward move between them.
const { route } = useRoute()
const view = computed<View>(() => route.value.view)
const showMenu = ref(false)
const showAccount = ref(false)
const scope = ref<'all' | 'friends'>('all')
const limit = ref(50)
const chatWith = ref<string | null>(null)

const go = (next: Exclude<View, 'profile'>) => { navigate({ view: next, who: null }); showMenu.value = false; if (next !== 'messages') chatWith.value = null }
const openMessages = (who: string) => { chatWith.value = who; navigate({ view: 'messages', who: null }); showMenu.value = false }
// "You": your own profile; until this page has keys, the sheet to pick a name or sign in.
const openOwnProfile = () => { showMenu.value = false; if (signer.value) openProfile(signer.value); else showAccount.value = true }

// The friends feed: friends' posts and this page's own.
const all = computed(() => {
  if (scope.value === 'all') return posts.value
  const mine = new Set([...circle.value.friends, signer.value])
  return posts.value.filter((p) => mine.has(p.signer))
})
const shown = computed(() => all.value.slice(0, limit.value))

const statusClass = computed(() => (connected.value ? 'status-connected' : starting.value ? 'status-connecting' : 'status-off'))
const statusText = computed(() => (connected.value ? 'Connected' : starting.value ? 'Connecting' : meshError.value ? 'Offline' : 'Starting'))

// Times ("5 min") move on without anything else changing.
const now = ref(Date.now())
const clock = setInterval(() => { now.value = Date.now() }, 30_000)
onUnmounted(() => clearInterval(clock))

const start = async () => {
  await startMesh()
  await initIdentity()
  const s = await storage()
  if (s) await startFeed(s)
}
const retry = () => { void start().catch(() => {}) }
onMounted(retry)

// Signing in or out changes who this page writes as: say so (a profile under the new key).
watch(signer, () => { void publishProfile() })

// The theme switch (the page starts in the kept theme, or the system's: index.html).
const THEME_KEY = 'pigeonfeed:theme'
const theme = ref<'light' | 'dark'>(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
const setTheme = (next: 'light' | 'dark') => {
  theme.value = next
  document.documentElement.dataset.theme = next
  document.documentElement.style.colorScheme = next
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#1b2430' : '#e8f6f9')
  try { localStorage.setItem(THEME_KEY, next) } catch { /* private mode: not remembered */ }
}
</script>

<style scoped>
/* ---------- top bar (as PigeonChess) ---------- */
.topbar { height: var(--topbar); display: flex; align-items: center; gap: 1.5rem; padding: 0 24px; border-bottom: 1px solid var(--line); background: var(--paper); position: sticky; top: 0; z-index: 20; }
.brand { display: flex; align-items: center; gap: 0.55rem; padding: 0.25rem 0.35rem; margin-left: -0.35rem; border-radius: var(--radius); color: var(--ink); }
.brand:hover .wordmark { color: var(--sheen); }
.brand-mark { width: 28px; height: 28px; }
.wordmark { font-stretch: 125%; font-weight: 800; font-size: 1.2rem; letter-spacing: -0.02em; }
.net { display: flex; align-items: center; gap: 0.5rem; color: var(--ink-2); font-size: 0.875rem; margin-right: auto; }
.net-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-strong); }
.status-connected .net-dot { background: var(--sheen); }
.status-connecting .net-dot { background: var(--slate); animation: blink 1.4s ease-in-out infinite; }
.net-peers { padding-left: 0.5rem; border-left: 1px solid var(--line); font-variant-numeric: tabular-nums; white-space: nowrap; }
@keyframes blink { 50% { opacity: 0.3; } }
.nav { display: flex; align-items: center; gap: 0.25rem; }
.nav-link { display: inline-flex; align-items: center; padding: 0.4rem 0.7rem; border-radius: var(--radius); font-weight: 500; color: var(--ink); }
.nav-link:hover { background: var(--wing); }
.nav-link.on { font-weight: 700; box-shadow: inset 0 -2px 0 var(--sheen); border-radius: var(--radius) var(--radius) 0 0; }
.nav-login { border: 1px solid var(--line-strong); margin-left: 0.5rem; max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.theme-switch { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: var(--radius); color: var(--ink-2); }
.theme-switch:hover { color: var(--ink); }
.theme-switch svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.menu-toggle { display: none; width: 44px; height: 44px; flex: none; place-items: center; border-radius: var(--radius); color: var(--ink); }
.menu-toggle svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }

/* ---------- pages ---------- */
.main { padding: 20px 24px; }
.column { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.wide { max-width: 980px; margin: 0 auto; }
.scope { display: grid; grid-template-columns: repeat(2, 1fr); padding: 3px; border: 1px solid var(--line-strong); border-radius: calc(var(--radius) + 3px); background: var(--surface); }
.scope-option { padding: 0.45rem 0.3rem; border-radius: var(--radius); font-weight: 700; font-size: 0.85rem; color: var(--ink-2); transition: background 0.15s, color 0.15s; }
.scope-option:hover:not(.picked) { color: var(--ink); }
.scope-option.picked { background: var(--ink); color: var(--paper); }
.btn-wide { width: 100%; padding: 0.8rem 1rem; font-size: 1rem; }
.build-footer { text-align: center; font-size: 0.75rem; color: var(--ink-2); padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom)); font-variant-numeric: tabular-nums; }
.build-footer a { color: inherit; text-decoration: none; }
.build-footer a:hover, .build-footer a:focus-visible { text-decoration: underline; }

@media (max-width: 860px) {
  .topbar { padding: 0 12px; gap: 0.75rem; }
  .main { padding: 16px 12px; }
  .net-text { display: none; }
  .net-peers { padding-left: 0; border-left: 0; }
  .menu-toggle { display: grid; }
  .nav { display: none; position: absolute; top: var(--topbar); left: 0; right: 0; flex-direction: column; align-items: stretch; background: var(--paper); border-bottom: 1px solid var(--line); padding: 8px 12px 12px; }
  .nav.open { display: flex; }
  .nav-link { text-align: left; padding: 0.65rem 0.5rem; }
  .nav-link.on { box-shadow: inset 2px 0 0 var(--sheen); border-radius: 0 var(--radius) var(--radius) 0; }
  .nav-login { margin: 0.5rem 0 0; max-width: none; }
}
</style>
