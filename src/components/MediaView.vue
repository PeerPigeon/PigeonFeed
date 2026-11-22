<template>
  <!-- A posted picture or video, fetched from the storage servers: a picture at once, a video when asked. -->
  <div class="media" :class="media.kind" :style="box">
    <img v-if="url && media.kind === 'image'" :src="url" :alt="media.name || 'Picture'" loading="lazy" @click="zoom = true" />
    <video v-else-if="url" :src="url" controls autoplay playsinline></video>
    <button v-else-if="media.kind === 'video' && !loading && !failed" type="button" class="media-play" @click="load">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      <span>Play video ({{ size }})</span>
    </button>
    <p v-else-if="failed" class="media-note">{{ failed }} <button type="button" class="btn btn-quiet" @click="load">Try again</button></p>
    <p v-else-if="waiting" class="media-note" role="status">Waiting for the storage servers to answer. This {{ what }} will show as soon as they do.</p>
    <p v-else class="media-note" role="status">Loading {{ what }}{{ done > 0 ? ` ${Math.round(done * 100)}%` : '…' }}</p>
    <div v-if="zoom && url" class="modal-overlay" @click="zoom = false">
      <img class="media-zoom" :src="url" :alt="media.name || 'Picture'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { mediaUrl } from '@/composables/useFeed'
import { NotYet } from '@/utils/media'
import type { MediaRef } from '@/utils/records'

const props = defineProps<{ media: MediaRef }>()
const url = ref<string | null>(null)
const loading = ref(false)
const failed = ref('')
const done = ref(0)
const waiting = ref(false)
const zoom = ref(false)

const size = computed(() => (props.media.size >= 1e6 ? `${(props.media.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(props.media.size / 1e3))} kB`))
// The room it will take, known before it loads, so the feed does not jump.
const box = computed(() => (props.media.w && props.media.h && !url.value ? { aspectRatio: `${props.media.w} / ${props.media.h}` } : {}))

const what = computed(() => (props.media.kind === 'video' ? 'video' : 'picture'))
// Still wanted: the post is on the page.
let here = true
onBeforeUnmount(() => { here = false })

const load = async () => {
  if (loading.value) return
  loading.value = true
  failed.value = ''
  waiting.value = false
  // The servers not answering with a piece (not reached yet on a page just opened, restarting, busy) is
  // not the file being gone: it is tried again, sooner at first, for as long as the post is on the page,
  // and shows by itself when they answer. Only a file that is not what its post says stops for good.
  for (let attempt = 0; here; attempt++) {
    try { url.value = await mediaUrl(props.media, (d) => { done.value = d }); break } catch (error) {
      if (!(error instanceof NotYet)) { failed.value = (error as Error).message; break }
      waiting.value = attempt >= 2
      await new Promise((r) => setTimeout(r, Math.min(12_000, 1500 * (attempt + 1))))
    }
  }
  waiting.value = false
  loading.value = false
}
onMounted(() => { if (props.media.kind === 'image') void load() })
</script>

<style scoped>
.media { border-radius: 8px; overflow: hidden; background: var(--wing); max-height: 520px; display: grid; place-items: center; min-height: 64px; }
.media img, .media video { display: block; width: 100%; max-height: 520px; object-fit: contain; background: var(--wing); }
.media img { cursor: zoom-in; }
.media-play { display: flex; align-items: center; gap: 0.5rem; padding: 1.6rem 1rem; width: 100%; justify-content: center; font-weight: 600; }
.media-play svg { width: 28px; height: 28px; fill: currentColor; }
.media-play:hover { color: var(--sheen); }
.media-note { padding: 1rem; font-size: 0.85rem; color: var(--ink-2); text-align: center; }
.media-zoom { max-width: 100%; max-height: 100%; border-radius: 8px; cursor: zoom-out; }
</style>
