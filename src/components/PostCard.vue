<template>
  <article class="post" :class="{ reply }">
    <header class="post-head">
      <PersonMark :who="post.signer" />
      <time class="post-time" :datetime="new Date(post.at).toISOString()" :title="new Date(post.at).toLocaleString()">{{ ago(post.at, now) }}</time>
      <div class="post-menu">
        <button type="button" class="btn btn-quiet more" :aria-expanded="menu" aria-label="More" @click="menu = !menu">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
        <div v-if="menu" class="menu" @click="menu = false">
          <template v-if="mine">
            <button type="button" class="menu-item stop" @click="act(() => removePost(post.key))">Delete</button>
          </template>
          <template v-else>
            <button v-if="relation === 'none'" type="button" class="menu-item" @click="act(() => befriend(post.signer))">Add friend</button>
            <button v-else-if="relation === 'request'" type="button" class="menu-item" @click="act(() => befriend(post.signer))">Accept friend request</button>
            <button v-else-if="relation === 'sent'" type="button" class="menu-item" @click="act(() => unfriend(post.signer))">Cancel friend request</button>
            <button v-else type="button" class="menu-item" @click="act(() => unfriend(post.signer))">Remove friend</button>
            <button v-if="canMessage(post.signer)" type="button" class="menu-item" @click="$emit('message', post.signer)">Message</button>
            <button type="button" class="menu-item" @click="setMuted(post.signer, true)">Mute</button>
          </template>
        </div>
      </div>
    </header>

    <p v-if="post.text" class="post-text"><template v-for="(part, i) in withLinks(post.text)" :key="i"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer nofollow">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></p>
    <div v-if="post.media.length" class="post-media" :class="{ many: post.media.length > 1 }">
      <MediaView v-for="(m, i) in post.media" :key="i" :media="m" />
    </div>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>

    <footer class="post-actions">
      <button type="button" class="btn btn-quiet act" :class="{ liked }" :aria-pressed="liked" @click="act(() => setLike(post.key, !liked))">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.9a4.2 4.2 0 0 1 7.5 2.5c0 5.5-7.5 10.1-7.5 10.1z" /></svg>
        {{ liked ? 'Liked' : 'Like' }}<span v-if="likeCount" class="n">{{ likeCount }}</span>
      </button>
      <button v-if="!reply" type="button" class="btn btn-quiet act" :aria-expanded="open" @click="open = !open">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5h15v10.5h-8l-4.5 3.5v-3.5h-2.5z" /></svg>
        Reply<span v-if="answers.length" class="n">{{ answers.length }}</span>
      </button>
    </footer>

    <section v-if="!reply && (open || answers.length)" class="replies" aria-label="Replies">
      <PostCard v-for="a in shown" :key="a.key" :post="a" reply :now="now" @message="(who) => $emit('message', who)" />
      <button v-if="answers.length > shown.length" type="button" class="btn btn-quiet" @click="open = true">Show all {{ answers.length }} replies</button>
      <Composer v-if="open" :re="post.key" />
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Composer from './Composer.vue'
import MediaView from './MediaView.vue'
import PersonMark from './PersonMark.vue'
import { befriend, canMessage, removePost, setLike, setMuted, unfriend, useFeed } from '@/composables/useFeed'
import { useIdentity } from '@/composables/useIdentity'
import { ago, type Post } from '@/utils/records'
import { withLinks } from '@/utils/look'

const props = defineProps<{ post: Post; reply?: boolean; now: number }>()
defineEmits<{ message: [who: string] }>()

const { signer } = useIdentity()
const { likes, replies, circle } = useFeed()
const menu = ref(false)
const open = ref(false)
const error = ref('')

const mine = computed(() => props.post.signer === signer.value)
const likedBy = computed(() => likes.value.get(props.post.key))
const likeCount = computed(() => likedBy.value?.size ?? 0)
const liked = computed(() => !!signer.value && !!likedBy.value?.has(signer.value))
const answers = computed(() => replies.value.get(props.post.key) ?? [])
// Closed, a post shows its last two replies; open, all of them.
const shown = computed(() => (open.value ? answers.value : answers.value.slice(-2)))
const relation = computed(() => {
  const who = props.post.signer
  if (circle.value.friends.includes(who)) return 'friend'
  if (circle.value.requests.includes(who)) return 'request'
  if (circle.value.sent.includes(who)) return 'sent'
  return 'none'
})

const act = async (run: () => Promise<void>) => {
  error.value = ''
  try { await run() } catch (e) { error.value = (e as Error).message }
}
</script>

<style scoped>
.post { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px 8px; display: flex; flex-direction: column; gap: 0.6rem; }
.post.reply { border: 0; border-left: 2px solid var(--line); border-radius: 0; padding: 4px 0 0 12px; background: none; gap: 0.35rem; }
.post-head { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.post-head :deep(.person) { flex: 0 1 auto; }
.post.reply :deep(.avatar) { width: 26px; height: 26px; font-size: 0.75rem; }
.post-time { color: var(--ink-2); font-size: 0.85rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
.post-menu { margin-left: auto; position: relative; }
.more { padding: 0.25rem 0.4rem; display: grid; }
.more svg { width: 20px; height: 20px; fill: currentColor; }
.menu { position: absolute; right: 0; top: 100%; z-index: 5; min-width: 12rem; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; padding: 4px; box-shadow: 0 10px 30px rgba(28, 33, 38, 0.18); display: flex; flex-direction: column; }
.menu-item { text-align: left; padding: 0.5rem 0.65rem; border-radius: var(--radius); font-weight: 500; }
.menu-item:hover { background: var(--wing); }
.menu-item.stop { color: var(--stop); }
.menu-item.stop:hover { background: var(--stop-wash); }
.post-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 1rem; line-height: 1.5; }
.post-media { display: grid; gap: 6px; }
.post-media.many { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.post-actions { display: flex; gap: 0.25rem; margin-left: -0.5rem; }
.act { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.5rem; font-size: 0.85rem; }
.act svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; }
.act.liked { color: var(--sheen); }
.act.liked svg { fill: currentColor; }
.act .n { font-variant-numeric: tabular-nums; font-weight: 700; }
.replies { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.25rem 0 0.5rem; }
</style>
