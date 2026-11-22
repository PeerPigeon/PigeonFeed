<template>
  <!-- One person: who they are, what you are to each other, and their posts and replies. -->
  <section class="profile">
    <div class="card head">
      <span class="avatar big" :style="{ background: hueOf(who) }" aria-hidden="true">{{ initial(name) }}</span>
      <div class="who">
        <h1 class="name">{{ shortName }}<span v-if="isAccount(who)" class="tick" title="An account name, checked">✓</span></h1>
        <p class="handle" :title="who">{{ isAccount(who) ? 'Account' : 'Guest' }} · key {{ who.slice(0, 10) }}…</p>
        <p v-if="profile?.bio" class="bio">{{ profile.bio }}</p>
        <p class="counts">
          <span><b>{{ mine.posts.length }}</b> {{ mine.posts.length === 1 ? 'post' : 'posts' }}</span>
          <span><b>{{ mine.replies.length }}</b> {{ mine.replies.length === 1 ? 'reply' : 'replies' }}</span>
          <span><b>{{ friends.length }}</b> {{ friends.length === 1 ? 'friend' : 'friends' }}</span>
          <span v-if="relation === 'friend'" class="tag">Your friend</span>
          <span v-else-if="relation === 'request'" class="tag">Wants to be friends</span>
        </p>
      </div>

      <div class="actions">
        <template v-if="self">
          <button class="btn btn-go" @click="$emit('account')">Edit profile</button>
        </template>
        <template v-else>
          <button v-if="relation === 'none'" class="btn btn-go" @click="act(() => befriend(who))">Add friend</button>
          <button v-else-if="relation === 'request'" class="btn btn-go" @click="act(() => befriend(who))">Accept friend request</button>
          <button v-else-if="relation === 'sent'" class="btn" @click="act(() => unfriend(who))">Cancel request</button>
          <button v-else class="btn" @click="act(() => unfriend(who))">Remove friend</button>
          <button v-if="canMessage(who)" class="btn" @click="$emit('message', who)">Message</button>
          <button v-if="isMuted" class="btn btn-quiet" @click="setMuted(who, false)">Unmute</button>
          <button v-else class="btn btn-quiet" @click="setMuted(who, true)">Mute</button>
        </template>
        <button class="btn btn-quiet" @click="copyLink">{{ copied ? 'Link copied' : 'Copy link' }}</button>
      </div>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
    </div>

    <p v-if="isMuted" class="hint">You muted {{ shortName }}: their posts are hidden everywhere. Unmute to see them again.</p>
    <template v-else>
      <div class="scope" role="tablist" aria-label="Their posts">
        <button type="button" role="tab" class="scope-option" :class="{ picked: tab === 'posts' }" :aria-selected="tab === 'posts'" @click="tab = 'posts'">Posts</button>
        <button type="button" role="tab" class="scope-option" :class="{ picked: tab === 'replies' }" :aria-selected="tab === 'replies'" @click="tab = 'replies'">Replies</button>
      </div>

      <!-- What has arrived shows at once; "Connecting" only while there is nothing yet. -->
      <template v-if="tab === 'posts'">
        <p v-if="!mine.posts.length" class="hint" :role="loaded ? undefined : 'status'">{{ !loaded ? 'Connecting to the mesh…' : self ? 'You have not posted yet.' : `${shortName} has not posted yet.` }}</p>
        <PostCard v-for="p in mine.posts.slice(0, limit)" :key="p.key" :post="p" :now="now" @message="(w) => $emit('message', w)" />
        <button v-if="mine.posts.length > limit" class="btn btn-wide" @click="limit += 50">Show older posts</button>
      </template>
      <template v-else>
        <p v-if="!mine.replies.length" class="hint" :role="loaded ? undefined : 'status'">{{ !loaded ? 'Connecting to the mesh…' : self ? 'You have not replied to anything yet.' : `${shortName} has not replied to anything yet.` }}</p>
        <div v-for="r in mine.replies.slice(0, limit)" :key="r.reply.key" class="card answered">
          <p class="to">
            <template v-if="r.to">Replying to <PersonMark :who="r.to.signer" class="inline" /></template>
            <template v-else>Replying to a post that is gone</template>
          </p>
          <blockquote v-if="r.to?.text" class="quote">{{ r.to.text.length > 160 ? `${r.to.text.slice(0, 160)}…` : r.to.text }}</blockquote>
          <PostCard :post="r.reply" reply :now="now" @message="(w) => $emit('message', w)" />
        </div>
        <button v-if="mine.replies.length > limit" class="btn btn-wide" @click="limit += 50">Show older replies</button>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PersonMark from './PersonMark.vue'
import PostCard from './PostCard.vue'
import { befriend, canMessage, friendsOfPerson, isAccount, nameOf, postsBy, profileOf, setMuted, unfriend, useFeed } from '@/composables/useFeed'
import { useIdentity } from '@/composables/useIdentity'
import { hueOf, initial } from '@/utils/look'

const props = defineProps<{ who: string; now: number }>()
defineEmits<{ message: [who: string]; account: [] }>()

const { signer } = useIdentity()
const { loaded, circle, muted } = useFeed()
const tab = ref<'posts' | 'replies'>('posts')
const limit = ref(50)
const error = ref('')
const copied = ref(false)
// Another person: from the top, on their posts.
watch(() => props.who, () => { tab.value = 'posts'; limit.value = 50; error.value = ''; copied.value = false })

const self = computed(() => props.who === signer.value)
const profile = computed(() => profileOf(props.who))
const name = computed(() => nameOf(props.who))
// The heading: their name alone (the key is on the line under it), "Guest" when they gave none.
const shortName = computed(() => (isAccount(props.who) ? name.value : profile.value?.name || 'Guest'))
const mine = computed(() => postsBy(props.who))
const friends = computed(() => friendsOfPerson(props.who))
const isMuted = computed(() => muted.value.has(props.who))
const relation = computed(() => {
  const who = props.who
  if (circle.value.friends.includes(who)) return 'friend'
  if (circle.value.requests.includes(who)) return 'request'
  if (circle.value.sent.includes(who)) return 'sent'
  return 'none'
})

const act = async (run: () => Promise<void>) => {
  error.value = ''
  try { await run() } catch (e) { error.value = (e as Error).message }
}
const copyLink = async () => {
  const url = `${location.origin}/u/${encodeURIComponent(props.who)}`
  try { await navigator.clipboard.writeText(url); copied.value = true; setTimeout(() => { copied.value = false }, 2000) } catch { error.value = `Copy this link: ${url}` }
}
</script>

<style scoped>
.profile { display: flex; flex-direction: column; gap: 12px; }
.head { display: grid; grid-template-columns: auto 1fr; gap: 0.6rem 1rem; padding: 18px 18px 14px; align-items: start; }
.avatar.big { width: 72px; height: 72px; font-size: 1.9rem; }
.who { min-width: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.name { font-size: 1.4rem; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; }
.name .tick { color: var(--sheen); margin-left: 0.3rem; font-size: 1.1rem; }
.handle { color: var(--ink-2); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.bio { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; margin-top: 0.25rem; }
.counts { display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; color: var(--ink-2); font-size: 0.9rem; margin-top: 0.35rem; align-items: center; }
.counts b { color: var(--ink); font-variant-numeric: tabular-nums; }
.tag { padding: 0.1rem 0.5rem; border-radius: 999px; background: var(--sheen-wash); color: var(--sheen); font-weight: 600; font-size: 0.8rem; }
.actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.4rem; padding-top: 0.4rem; }
.head .alert { grid-column: 1 / -1; }
.scope { display: grid; grid-template-columns: repeat(2, 1fr); padding: 3px; border: 1px solid var(--line-strong); border-radius: calc(var(--radius) + 3px); background: var(--surface); }
.scope-option { padding: 0.45rem 0.3rem; border-radius: var(--radius); font-weight: 700; font-size: 0.85rem; color: var(--ink-2); transition: background 0.15s, color 0.15s; }
.scope-option:hover:not(.picked) { color: var(--ink); }
.scope-option.picked { background: var(--ink); color: var(--paper); }
.answered { padding: 12px 16px 6px; display: flex; flex-direction: column; gap: 0.5rem; }
.to { display: flex; align-items: center; gap: 0.4rem; color: var(--ink-2); font-size: 0.85rem; flex-wrap: wrap; }
.to :deep(.avatar) { width: 20px; height: 20px; font-size: 0.65rem; }
.to :deep(.person) { gap: 0.35rem; }
.quote { margin: 0; padding: 0.4rem 0.7rem; border-left: 3px solid var(--line-strong); color: var(--ink-2); font-size: 0.9rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.btn-wide { width: 100%; padding: 0.8rem 1rem; font-size: 1rem; }
@media (max-width: 520px) {
  .head { grid-template-columns: 1fr; }
  .avatar.big { width: 64px; height: 64px; }
}
</style>
