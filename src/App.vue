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
        <button class="nav-link nav-login" @click="showAccount = true; showMenu = false">{{ account ? account.alias : (guestName || 'You') }}</button>
      </nav>
      <button
        type="button" class="theme-switch"
        :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" :title="theme === 'dark' ? 'Light mode' : 'Dark mode'"
        @click="setTheme(theme === 'dark' ? 'light' : 'dark')"
      >
        <svg v-if="theme === 'dark'" viewBox="0 0 576 512" aria-hidden="true"><path :d="SUN_PATH" /></svg>
        <svg v-else viewBox="0 0 512 512" aria-hidden="true"><path :d="MOON_PATH" /></svg>
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

      <section v-else class="wide">
        <MessagesView :other="chatWith" :now="now" @pick="(who) => (chatWith = who)" />
      </section>
    </main>

    <footer v-if="view !== 'messages'" class="build-footer">
      PigeonFeed {{ build }} · peer to peer on <a href="https://github.com/PeerPigeon/PeerPigeon" target="_blank" rel="noopener">PeerPigeon</a>{{ relay ? ` · relay ${relay}` : '' }}
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
import { startMesh, storage, useMesh } from './composables/useMesh'
import { initIdentity, useIdentity } from './composables/useIdentity'
import { publishProfile, startFeed, useFeed } from './composables/useFeed'

declare const __BUILD__: string
const build = __BUILD__

const { connected, starting, error: meshError, online, relay } = useMesh()
const { account, signer } = useIdentity()
const { loaded, posts, circle, unread, guestName } = useFeed()

type View = 'feed' | 'friends' | 'messages'
const view = ref<View>('feed')
const showMenu = ref(false)
const showAccount = ref(false)
const scope = ref<'all' | 'friends'>('all')
const limit = ref(50)
const chatWith = ref<string | null>(null)

const go = (next: View) => { view.value = next; showMenu.value = false; if (next !== 'messages') chatWith.value = null }
const openMessages = (who: string) => { chatWith.value = who; view.value = 'messages'; showMenu.value = false }

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
const SUN_PATH = 'M178.2-10.1c7.4-3.1 15.8-2.2 22.5 2.2l87.8 58.2 87.8-58.2c6.7-4.4 15.1-5.2 22.5-2.2S411.4-.5 413 7.3l20.9 103.2 103.2 20.9c7.8 1.6 14.4 7 17.4 14.3s2.2 15.8-2.2 22.5l-58.2 87.8 58.2 87.8c4.4 6.7 5.200 15.1 2.2 22.5s-9.6 12.8-17.4 14.3L433.8 401.4 413 504.7c-1.6 7.8-7 14.4-14.3 17.4s-15.8 2.2-22.5-2.2l-87.8-58.2-87.8 58.2c-6.7 4.4-15.1 5.2-22.5 2.2s-12.8-9.6-14.3-17.4L143 401.4 39.7 380.5c-7.8-1.6-14.4-7-17.4-14.3s-2.2-15.8 2.2-22.5L82.7 256 24.5 168.2c-4.4-6.7-5.2-15.1-2.2-22.5s9.6-12.8 17.4-14.3L143 110.6 163.9 7.3c1.6-7.8 7-14.4 14.3-17.4zM207.6 256a80.4 80.4 0 1 1 160.8 0 80.4 80.4 0 1 1 -160.8 0zm208.8 0a128.4 128.4 0 1 0 -256.8 0 128.4 128.4 0 1 0 256.8 0z'
const MOON_PATH = 'M256 0C114.6 0 0 114.6 0 256S114.6 512 256 512c68.8 0 131.3-27.2 177.3-71.4 7.3-7 9.4-17.9 5.3-27.1s-13.7-14.9-23.8-14.1c-4.9 .4-9.8 .6-14.8 .6-101.6 0-184-82.4-184-184 0-72.1 41.5-134.6 102.1-164.8 9.1-4.5 14.3-14.3 13.1-24.4S322.6 8.5 312.7 6.3C294.4 2.2 275.4 0 256 0z'
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
.theme-switch svg { width: 18px; height: 18px; fill: currentColor; }
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
