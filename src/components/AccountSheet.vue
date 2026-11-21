<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <!-- Signed in -->
      <template v-if="account">
        <h3 id="account-title">{{ account.alias }}</h3>
        <p>You are signed in. What you post, your friends and your messages are yours on every device you sign in from.</p>
        <label class="field"><span>About you</span><input v-model="about" type="text" :maxlength="MAX_BIO" placeholder="A line about you (optional)" /></label>
        <div class="modal-buttons">
          <button class="btn btn-stop" @click="out">Log out</button>
          <button class="btn" @click="$emit('close')">Close</button>
          <button class="btn btn-go" @click="saveProfile">Save</button>
        </div>
      </template>

      <!-- Not signed in: a name for this browser, or an account -->
      <template v-else-if="mode === 'guest'">
        <h3 id="account-title">You</h3>
        <p>No account is needed. This browser has keys of its own, and what you post is signed with them. Pick the name others see.</p>
        <label class="field"><span>Name</span><input v-model="name" type="text" :maxlength="MAX_NAME" placeholder="Guest" @keyup.enter="saveProfile" /></label>
        <label class="field"><span>About you</span><input v-model="about" type="text" :maxlength="MAX_BIO" placeholder="A line about you (optional)" @keyup.enter="saveProfile" /></label>
        <div class="modal-buttons">
          <button class="btn" @click="$emit('close')">Close</button>
          <button class="btn btn-go" @click="saveProfile">Save</button>
        </div>
        <p class="foot">
          To be the same person on another device, and to hold a name nobody else can take:
          <a href="#" @click.prevent="mode = 'login'">log in</a> or <a href="#" @click.prevent="mode = 'register'">create an account</a>.
          PigeonChess accounts work here.
        </p>
      </template>

      <template v-else>
        <h3 id="account-title">{{ mode === 'login' ? 'Log in' : 'Create an account' }}</h3>
        <p>{{ mode === 'login'
          ? 'Your account is the same one as on PigeonChess.'
          : 'Pick a name others will see, and a password to protect it.' }}</p>
        <label class="field"><span>Username</span><input v-model="username" type="text" autocomplete="username" @keyup.enter="submit" /></label>
        <label class="field"><span>Password</span><input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" @keyup.enter="submit" /></label>
        <template v-if="mode === 'register'">
          <ul class="rules">
            <li :class="{ met: password.length >= 12 }">12 or more characters</li>
            <li :class="{ met: /[A-Z]/.test(password) && /[a-z]/.test(password) }">Upper and lower case letters</li>
            <li :class="{ met: /\d/.test(password) }">A number</li>
          </ul>
          <p class="hint">Save this password somewhere safe, such as a password manager. You need it, with this username, to log in again, and it cannot be reset.</p>
        </template>
        <p v-if="error" class="alert" role="alert">{{ error }}</p>
        <div class="modal-buttons">
          <button class="btn" @click="mode = 'guest'; error = ''">Back</button>
          <button class="btn btn-go" :disabled="busy || !username.trim() || !password || (mode === 'register' && !strong)" @click="submit">
            {{ busy ? 'Checking' : (mode === 'login' ? 'Log in' : 'Create account') }}
          </button>
        </div>
        <p class="foot">
          {{ mode === 'login' ? 'New here?' : 'Already have an account?' }}
          <a href="#" @click.prevent="mode = mode === 'login' ? 'register' : 'login'; error = ''">{{ mode === 'login' ? 'Create an account' : 'Log in' }}</a>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { createAccount, logIn, logOut, useIdentity } from '@/composables/useIdentity'
import { setProfile, useFeed } from '@/composables/useFeed'
import { MAX_BIO, MAX_NAME } from '@/utils/records'

const emit = defineEmits<{ close: [] }>()
const { account } = useIdentity()
const { guestName, bio } = useFeed()

const mode = ref<'guest' | 'login' | 'register'>('guest')
const name = ref(guestName.value)
const about = ref(bio.value)
const username = ref((() => { try { return localStorage.getItem('pigeonfeed:username') ?? '' } catch { return '' } })())
const password = ref('')
const busy = ref(false)
const error = ref('')
const strong = computed(() => password.value.length >= 12 && /[A-Z]/.test(password.value) && /[a-z]/.test(password.value) && /\d/.test(password.value))

const saveProfile = async () => {
  await setProfile(account.value ? guestName.value : name.value, about.value)
  emit('close')
}

const submit = async () => {
  if (busy.value || !username.value.trim() || !password.value) return
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'login') await logIn(username.value.trim(), password.value)
    else await createAccount(username.value.trim(), password.value)
    password.value = ''
    emit('close')
  } catch (e) {
    const code = (e as { code?: string }).code
    error.value = code ? (e as Error).message : mode.value === 'login' ? 'Wrong username or password' : `Could not create the account: ${(e as Error).message}`
  } finally { busy.value = false }
}

const out = async () => {
  await logOut()
  emit('close')
}
</script>

<style scoped>
.foot { margin: 1rem 0 0; font-size: 0.875rem; }
.rules { list-style: none; font-size: 0.85rem; color: var(--ink-2); margin: 0.25rem 0 0.75rem; }
.rules li::before { content: '○ '; }
.rules li.met { color: var(--sheen); }
.rules li.met::before { content: '● '; }
</style>
