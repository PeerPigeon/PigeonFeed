<template>
  <!-- A person: their mark and name, a link to their profile (plain where it sits inside a button). -->
  <a v-if="link" class="person person-link" :href="profileHref(who)" :title="`${name}'s profile`" @click.exact.prevent="openProfile(who)">
    <span class="avatar" :style="{ background: hueOf(who) }" aria-hidden="true">{{ initial(name) }}</span>
    <span class="person-name">{{ name }}<span v-if="isAccount(who)" class="tick" title="An account name, checked">✓</span></span>
  </a>
  <span v-else class="person">
    <span class="avatar" :style="{ background: hueOf(who) }" aria-hidden="true">{{ initial(name) }}</span>
    <span class="person-name">{{ name }}<span v-if="isAccount(who)" class="tick" title="An account name, checked">✓</span></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isAccount, nameOf } from '@/composables/useFeed'
import { openProfile, profileHref } from '@/composables/useRoute'
import { hueOf, initial } from '@/utils/look'

const props = withDefaults(defineProps<{ who: string; link?: boolean }>(), { link: true })
const name = computed(() => nameOf(props.who))
</script>

<style scoped>
.person-link { color: inherit; text-decoration: none; border-radius: var(--radius); }
.person-link:hover .person-name, .person-link:focus-visible .person-name { text-decoration: underline; }
</style>
