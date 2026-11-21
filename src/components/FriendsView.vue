<template>
  <section class="friends">
    <template v-if="circle.requests.length">
      <h2 class="section-title">Friend requests</h2>
      <ul class="rows">
        <li v-for="who in circle.requests" :key="who" class="card row">
          <PersonMark :who="who" />
          <span class="row-actions">
            <button class="btn btn-go" @click="act(() => befriend(who))">Accept</button>
            <button class="btn btn-quiet" @click="setMuted(who, true)">Mute</button>
          </span>
        </li>
      </ul>
    </template>

    <h2 class="section-title">Friends</h2>
    <p v-if="!circle.friends.length" class="hint">No friends yet. Add someone below, or from the menu on one of their posts: you are friends once they add you back.</p>
    <ul v-else class="rows">
      <li v-for="who in circle.friends" :key="who" class="card row">
        <PersonMark :who="who" />
        <span class="row-actions">
          <button v-if="canMessage(who)" class="btn" @click="$emit('message', who)">Message</button>
          <button class="btn btn-quiet" @click="act(() => unfriend(who))">Remove</button>
        </span>
      </li>
    </ul>

    <template v-if="circle.sent.length">
      <h2 class="section-title">Waiting for an answer</h2>
      <ul class="rows">
        <li v-for="who in circle.sent" :key="who" class="card row">
          <PersonMark :who="who" />
          <span class="row-actions"><button class="btn btn-quiet" @click="act(() => unfriend(who))">Cancel</button></span>
        </li>
      </ul>
    </template>

    <h2 class="section-title">People here</h2>
    <label class="field find"><span>Find someone</span><input v-model="query" type="search" placeholder="A name" /></label>
    <p v-if="!others.length" class="hint">{{ query ? 'Nobody by that name.' : 'Nobody else has been here yet.' }}</p>
    <ul v-else class="rows">
      <li v-for="p in others" :key="p.signer" class="card row">
        <span class="who">
          <PersonMark :who="p.signer" />
          <span v-if="p.bio" class="bio">{{ p.bio }}</span>
        </span>
        <span class="row-actions">
          <button class="btn" @click="act(() => befriend(p.signer))">Add friend</button>
          <button class="btn btn-quiet" @click="$emit('message', p.signer)">Message</button>
        </span>
      </li>
    </ul>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>

    <template v-if="muted.size">
      <h2 class="section-title">Muted</h2>
      <ul class="rows">
        <li v-for="who in [...muted]" :key="who" class="card row">
          <PersonMark :who="who" />
          <span class="row-actions"><button class="btn btn-quiet" @click="setMuted(who, false)">Unmute</button></span>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import PersonMark from './PersonMark.vue'
import { befriend, canMessage, nameOf, setMuted, unfriend, useFeed } from '@/composables/useFeed'

defineEmits<{ message: [who: string] }>()
const { circle, people, muted } = useFeed()
const query = ref('')
const error = ref('')

// Everyone who isn't already a friend, asked or asking; 50 at most, the most recently seen first.
const others = computed(() => {
  const known = new Set([...circle.value.friends, ...circle.value.requests, ...circle.value.sent])
  const q = query.value.trim().toLowerCase()
  return people.value.filter((p) => !known.has(p.signer) && (!q || nameOf(p.signer).toLowerCase().includes(q))).slice(0, 50)
})

const act = async (run: () => Promise<void>) => {
  error.value = ''
  try { await run() } catch (e) { error.value = (e as Error).message }
}
</script>

<style scoped>
.rows { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 0.75rem; padding: 10px 14px; }
.who { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.bio { color: var(--ink-2); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-left: calc(36px + 0.6rem); }
.row-actions { margin-left: auto; display: flex; gap: 0.35rem; flex: none; }
.find { max-width: 20rem; }
.section-title:first-child { margin-top: 0; }
</style>
