<template>
  <section class="messages" :class="{ picked: !!other }">
    <aside class="convs" aria-label="Conversations">
      <p v-if="!list.length" class="hint">No messages yet. Start one from the Friends page, or from the menu on someone's post.</p>
      <button v-for="c in list" :key="c.other" type="button" class="conv" :class="{ on: c.other === other }" @click="$emit('pick', c.other)">
        <PersonMark :who="c.other" :link="false" />
        <span class="conv-last">{{ c.last }}</span>
        <span v-if="c.unread" class="badge" :aria-label="`${c.unread} unread`">{{ c.unread }}</span>
      </button>
    </aside>

    <div v-if="other" class="thread">
      <header class="thread-head">
        <button type="button" class="btn btn-quiet back" @click="$emit('pick', null)">Back</button>
        <PersonMark :who="other" />
      </header>
      <ol ref="scroller" class="bubbles">
        <li v-if="!thread.length" class="hint">Messages here are encrypted to the two of you. Others can see that you wrote to each other, and when, but not what.</li>
        <li v-for="m in thread" :key="m.key" class="bubble" :class="{ mine: m.mine }">
          <p v-if="m.text" class="bubble-text"><template v-for="(part, i) in withLinks(m.text)" :key="i"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer nofollow">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></p>
          <p v-else class="bubble-text quiet">{{ m.text === null ? "This message can't be opened with the keys on this device." : 'Opening…' }}</p>
          <time class="bubble-time" :datetime="new Date(m.at).toISOString()">{{ ago(m.at, now) }}</time>
        </li>
      </ol>
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <form v-if="canMessage(other)" class="write" @submit.prevent="send">
        <input v-model="text" type="text" :maxlength="MAX_TEXT" placeholder="Write a message" aria-label="Your message" />
        <button class="btn btn-go" type="submit" :disabled="sending || !text.trim()">Send</button>
      </form>
      <p v-else class="hint">They haven't opened this version of PigeonFeed yet, so there are no keys to write to them with.</p>
    </div>
    <p v-else class="thread empty hint">Pick a conversation.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import PersonMark from './PersonMark.vue'
import { canMessage, markRead, sendMessage, useFeed } from '@/composables/useFeed'
import { MAX_TEXT, ago } from '@/utils/records'
import { withLinks } from '@/utils/look'

const props = defineProps<{ other: string | null; now: number }>()
defineEmits<{ pick: [who: string | null] }>()

const { conversations, unreadIn } = useFeed()
const text = ref('')
const sending = ref(false)
const error = ref('')
const scroller = ref<HTMLElement | null>(null)

const thread = computed(() => (props.other ? conversations.value.get(props.other) ?? [] : []))
// Conversations by their last message, newest first; one being started (no messages yet) on top.
const list = computed(() => {
  const rows = [...conversations.value.entries()].map(([other, ms]) => {
    const last = ms[ms.length - 1]
    return { other, at: last?.at ?? 0, last: last ? `${last.mine ? 'You: ' : ''}${last.text ?? '(could not be opened)'}` : '', unread: unreadIn(other) }
  }).sort((a, b) => b.at - a.at)
  if (props.other && !conversations.value.has(props.other)) rows.unshift({ other: props.other, at: Date.now(), last: '', unread: 0 })
  return rows
})

// The open conversation counts as read, and stays scrolled to its newest message.
watch([() => props.other, () => thread.value.length], async () => {
  if (!props.other) return
  markRead(props.other)
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
}, { immediate: true })

const send = async () => {
  if (!props.other || sending.value || !text.value.trim()) return
  sending.value = true
  error.value = ''
  try { await sendMessage(props.other, text.value); text.value = '' } catch (e) { error.value = (e as Error).message } finally { sending.value = false }
}
</script>

<style scoped>
.messages { display: grid; grid-template-columns: minmax(0, 280px) minmax(0, 1fr); gap: 16px; height: calc(100dvh - var(--topbar) - 40px); min-height: 360px; }
.convs { display: flex; flex-direction: column; gap: 4px; overflow: auto; }
.conv { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.1rem 0.5rem; text-align: left; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; }
.conv:hover { background: var(--wing); }
.conv.on { background: var(--surface); border-color: var(--line-strong); }
.conv-last { grid-column: 1; color: var(--ink-2); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-left: calc(36px + 0.6rem); }
.conv .badge { grid-row: 1; grid-column: 2; }
.thread { display: flex; flex-direction: column; gap: 0.6rem; min-height: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
.thread.empty { align-items: center; justify-content: center; }
.thread-head { display: flex; align-items: center; gap: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--line); }
.back { display: none; margin-left: -0.5rem; }
.bubbles { list-style: none; flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
.bubble { align-self: flex-start; max-width: min(82%, 34rem); background: var(--paper); border-radius: 12px 12px 12px 4px; padding: 6px 10px; }
.bubble.mine { align-self: flex-end; background: var(--sheen-wash); border-radius: 12px 12px 4px 12px; }
.bubble-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.bubble-text.quiet { color: var(--ink-2); font-style: italic; }
.bubble-time { display: block; font-size: 0.72rem; color: var(--ink-2); text-align: right; font-variant-numeric: tabular-nums; }
.write { display: flex; gap: 0.5rem; }
@media (max-width: 720px) {
  .messages { grid-template-columns: minmax(0, 1fr); height: calc(100dvh - var(--topbar) - 32px); }
  .messages.picked .convs { display: none; }
  .messages:not(.picked) .thread { display: none; }
  .back { display: inline-flex; }
}
</style>
