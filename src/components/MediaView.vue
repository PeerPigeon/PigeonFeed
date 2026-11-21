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
    <p v-else class="media-note" role="status">Loading {{ media.kind === 'video' ? 'video' : 'picture' }}{{ done > 0 ? ` ${Math.round(done * 100)}%` : '…' }}</p>
    <div v-if="zoom && url" class="modal-overlay" @click="zoom = false">
      <img class="media-zoom" :src="url" :alt="media.name || 'Picture'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { mediaUrl } from '@/composables/useFeed'
import type { MediaRef } from '@/utils/records'

const props = defineProps<{ media: MediaRef }>()
const url = ref<string | null>(null)
const loading = ref(false)
const failed = ref('')
const done = ref(0)
const zoom = ref(false)

const size = computed(() => (props.media.size >= 1e6 ? `${(props.media.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(props.media.size / 1e3))} kB`))
// The room it will take, known before it loads, so the feed does not jump.
const box = computed(() => (props.media.w && props.media.h && !url.value ? { aspectRatio: `${props.media.w} / ${props.media.h}` } : {}))

const load = async () => {
  if (loading.value) return
  loading.value = true
  failed.value = ''
  try { url.value = await mediaUrl(props.media, (d) => { done.value = d }) } catch (error) { failed.value = (error as Error).message } finally { loading.value = false }
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
