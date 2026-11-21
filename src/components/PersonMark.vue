<template>
  <span class="person">
    <span class="avatar" :style="{ background: hueOf(who) }" aria-hidden="true">{{ initial(name) }}</span>
    <span class="person-name">{{ name }}<span v-if="isAccount(who)" class="tick" title="An account name, checked">✓</span></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isAccount, nameOf } from '@/composables/useFeed'
import { hueOf, initial } from '@/utils/look'

const props = defineProps<{ who: string }>()
const name = computed(() => nameOf(props.who))
</script>
