<template>
  <!-- Every emoji in Unicode's full list (unicode.org/emoji/charts/full-emoji-list.html), by its groups,
       found by name. Picking one hands it back; the composer puts it where the cursor was. -->
  <div class="modal-overlay" @click.self="$emit('close')" @keydown.esc.stop="$emit('close')">
    <div class="modal emoji-modal" role="dialog" aria-modal="true" aria-label="Emoji">
      <input
        ref="search" v-model="query" type="search" class="emoji-search" placeholder="Search emoji, like “heart” or “cat”"
        aria-label="Search emoji" @keydown.enter.prevent="first && $emit('pick', first.char)"
      />
      <div class="emoji-list">
        <section v-for="g in shown" :key="g.group">
          <h4>{{ g.group }}</h4>
          <div class="emoji-grid">
            <button
              v-for="e in g.items" :key="e.char" type="button" class="emoji" :title="e.name" :aria-label="e.name"
              @click="$emit('pick', e.char)" @mouseenter="hover = e" @focus="hover = e"
            >{{ e.char }}</button>
          </div>
        </section>
        <p v-if="!shown.length" class="none">No emoji is called “{{ query.trim() }}”.</p>
      </div>
      <p class="emoji-name">
        <template v-if="hover"><span class="big">{{ hover.char }}</span> {{ hover.name }}</template>
        <template v-else>{{ query.trim() ? `${matches.length} of ${count}` : count }} emoji</template>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import data from 'unicode-emoji-json/data-by-emoji.json'

defineEmits<{ pick: [char: string]; close: [] }>()

interface Emoji { char: string; name: string; group: string }
// In Unicode's order (the chart's), with names as the chart gives them.
const all: Emoji[] = Object.entries(data as Record<string, { name: string; group: string }>)
  .map(([char, e]) => ({ char, name: e.name, group: e.group }))
const count = all.length

const query = ref('')
const hover = ref<Emoji | null>(null)
const search = ref<HTMLInputElement | null>(null)
onMounted(() => search.value?.focus())

// The words of each name, for search: "cat" finds cat face, not identification card.
const wordsOf = new Map(all.map((e) => [e, e.name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)]))
// Every word typed must start a word of the name ("red hea" finds red heart).
const matches = computed(() => {
  const typed = query.value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!typed.length) return all
  return all.filter((e) => {
    const words = wordsOf.get(e)!
    return typed.every((t) => words.some((w) => w.startsWith(t)))
  })
})
const first = computed(() => matches.value[0] ?? null)
const shown = computed(() => {
  const groups = new Map<string, Emoji[]>()
  for (const e of matches.value) {
    let list = groups.get(e.group)
    if (!list) groups.set(e.group, (list = []))
    list.push(e)
  }
  return [...groups].map(([group, items]) => ({ group, items }))
})
</script>

<style scoped>
.emoji-modal { display: flex; flex-direction: column; gap: 0.6rem; width: min(100%, 520px); height: min(560px, calc(100dvh - 32px)); padding: 1rem; }
.emoji-search { width: 100%; }
.emoji-list { flex: 1; overflow-y: auto; min-height: 0; }
.emoji-list h4 { position: sticky; top: 0; background: var(--surface); font-size: 0.8rem; font-weight: 600; color: var(--ink-2); padding: 0.4rem 0.2rem; margin: 0; z-index: 1; }
.emoji-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); }
.emoji { font-size: 1.6rem; line-height: 1; height: 44px; border: none; background: none; border-radius: 8px; cursor: pointer; padding: 0; font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; }
.emoji:hover, .emoji:focus-visible { background: var(--wing); }
.none { padding: 1rem 0.2rem; }
.emoji-name { margin: 0 !important; min-height: 2rem; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; border-top: 1px solid var(--line); padding-top: 0.5rem; }
.emoji-name .big { font-size: 1.5rem; }
</style>
