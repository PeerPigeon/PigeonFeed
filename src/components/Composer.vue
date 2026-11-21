<template>
  <!-- Writing a post, or a reply to one: text, and up to four pictures or videos. -->
  <form
    class="composer" :class="{ small: !!re, dropping }" @submit.prevent="send"
    @dragenter.prevent="dragIn" @dragover.prevent="dragIn" @dragleave="dragOut" @drop.prevent="drop"
  >
    <textarea
      v-model="text" :rows="re ? 2 : 3" :maxlength="MAX_TEXT" :placeholder="re ? 'Write a reply' : 'What is happening?'"
      :aria-label="re ? 'Your reply' : 'Your post'" @keydown.enter.meta.prevent="send" @keydown.enter.ctrl.prevent="send"
      @paste="paste"
    ></textarea>
    <p v-if="dropping" class="drop-hint">Drop pictures or videos to add them</p>
    <ul v-if="files.length" class="files">
      <li v-for="(f, i) in files" :key="i">
        <span class="file-name">{{ f.name }}</span>
        <button type="button" class="btn btn-quiet" :disabled="busy" :aria-label="`Remove ${f.name}`" @click="files.splice(i, 1)">Remove</button>
      </li>
    </ul>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <div class="composer-row">
      <label class="btn btn-quiet attach" :class="{ off: busy || files.length >= MAX_MEDIA }">
        <input type="file" accept="image/*,video/*" multiple :disabled="busy || files.length >= MAX_MEDIA" @change="pick" />
        Add a picture or video
      </label>
      <span class="count" :class="{ near: text.length > MAX_TEXT - 100 }">{{ text.length > MAX_TEXT - 200 ? MAX_TEXT - text.length : '' }}</span>
      <button class="btn btn-go" type="submit" :disabled="busy || (!text.trim() && !files.length)">{{ busy ? progress : (re ? 'Reply' : 'Post') }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { post } from '@/composables/useFeed'
import { blobs } from '@/composables/useMesh'
import { prepare, upload } from '@/utils/media'
import { MAX_MEDIA, MAX_TEXT, type MediaRef } from '@/utils/records'

const props = defineProps<{ re?: string }>()
const emit = defineEmits<{ posted: [] }>()

const text = ref('')
const files = ref<File[]>([])
const busy = ref(false)
const progress = ref('Posting')
const error = ref('')

// A page with something being written does not reload itself for a new build (main.ts).
watch([text, files], () => {
  if (text.value.trim() || files.value.length) document.documentElement.dataset.writing = '1'
  else delete document.documentElement.dataset.writing
}, { deep: true })

/** Pictures and videos added, from the picker, a paste or a drop: up to MAX_MEDIA. */
const add = (list: File[]) => {
  const media = list.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
  if (!media.length) { if (list.length) error.value = 'Only pictures and videos can be added.'; return false }
  if (busy.value) return true
  if (files.value.length + media.length > MAX_MEDIA) error.value = `Up to ${MAX_MEDIA} pictures or videos in a post.`
  else error.value = ''
  // A pasted picture is "image.png" every time: a name of its own, to tell them apart.
  let n = files.value.length
  const named = media.map((f) => (/^image\.\w+$/.test(f.name) ? new File([f], `Pasted picture ${++n}.${f.name.split('.').pop()}`, { type: f.type }) : (n++, f)))
  files.value = [...files.value, ...named].slice(0, MAX_MEDIA)
  return true
}

const pick = (e: Event) => {
  const input = e.target as HTMLInputElement
  add(Array.from(input.files ?? []))
  input.value = ''
}

// Pasted (right-click Paste, or Cmd/Ctrl+V): pictures in it are added; its text goes in as text.
const paste = (e: ClipboardEvent) => {
  const list = Array.from(e.clipboardData?.files ?? [])
  if (!list.length) return
  const hasText = !!e.clipboardData?.getData('text/plain')
  if (add(list) && !hasText) e.preventDefault()
}

// Dragged onto the box: outlined while over it, added when dropped.
const dropping = ref(false)
let depth = 0
const dragIn = (e: DragEvent) => {
  if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return
  if (e.type === 'dragenter') depth++
  dropping.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}
const dragOut = () => { depth = Math.max(0, depth - 1); if (!depth) dropping.value = false }
const drop = (e: DragEvent) => {
  depth = 0
  dropping.value = false
  add(Array.from(e.dataTransfer?.files ?? []))
}

const send = async () => {
  if (busy.value || (!text.value.trim() && !files.value.length)) return
  busy.value = true
  error.value = ''
  try {
    const media: MediaRef[] = []
    for (const [i, file] of files.value.entries()) {
      const label = files.value.length > 1 ? `Sending ${i + 1} of ${files.value.length}` : 'Sending'
      progress.value = label
      const ready = await prepare(file)
      media.push(await upload(blobs, ready.bytes, ready.about, (done) => { progress.value = `${label} ${Math.round(done * 100)}%` }))
    }
    progress.value = 'Posting'
    await post(text.value, media, props.re)
    text.value = ''
    files.value = []
    emit('posted')
  } catch (e) {
    error.value = (e as Error).message
  } finally { busy.value = false }
}
</script>

<style scoped>
.composer { display: flex; flex-direction: column; gap: 0.5rem; border-radius: var(--radius, 8px); }
.composer.dropping { outline: 2px dashed var(--sheen); outline-offset: 4px; }
.drop-hint { font-size: 0.85rem; color: var(--sheen); }
.composer textarea { resize: vertical; min-height: 4.5rem; }
.composer.small textarea { min-height: 3rem; }
.composer-row { display: flex; align-items: center; gap: 0.5rem; }
.attach { cursor: pointer; margin-left: -0.5rem; }
.attach.off { opacity: 0.45; cursor: not-allowed; }
.attach input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.attach:focus-within { outline: 2px solid var(--sheen); outline-offset: 2px; }
.count { margin-left: auto; font-size: 0.8rem; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.count.near { color: var(--stop); }
.count + .btn { margin-left: 0; }
.files { list-style: none; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
.files li { display: flex; align-items: center; gap: 0.5rem; }
.file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
</style>
