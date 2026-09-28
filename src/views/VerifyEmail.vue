<!--
  VerifyEmail.vue — email verification view.

  Reached after sign-up (or from login for unverified accounts) and from the
  emailed link, which pre-fills `email` and `code` and submits automatically.
  A correct code signs the user in; a resend button requests a new code.
-->
<template>
  <div class="code-page">
    <div class="code-container">
      <!-- Page Header -->
      <div class="code-header">
        <h1 class="code-title">Verify your email</h1>
        <p class="code-subtitle">
          We sent a 6-digit code to <strong>{{ email || 'your email' }}</strong
          >.
        </p>
      </div>

      <!-- Form -->
      <form class="code-form" data-testid="verify-email-form" @submit.prevent="submit">
        <!-- Title: Email -->
        <div v-if="!emailFromLink" class="form-group">
          <label for="verify-email" class="form-label">Email</label>
          <input id="verify-email" v-model="email" type="email" class="input" required />
        </div>

        <!-- Title: Code -->
        <div class="form-group">
          <label for="verify-code" class="form-label">Verification code</label>
          <input
            id="verify-code"
            v-model="code"
            type="text"
            class="input code-input"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            placeholder="123456"
            required
          />
        </div>

        <button type="submit" class="btn btn-primary btn-large" :disabled="authStore.isLoading">
          {{ authStore.isLoading ? 'Verifying...' : 'Verify and sign in' }}
        </button>

        <div v-if="authStore.error" class="error-message">{{ authStore.error }}</div>
      </form>

      <!-- Footer -->
      <!-- Title: Resend -->
      <div class="code-footer">
        <p class="code-note">New accounts that aren't verified within 3 days are removed.</p>
        <p>
          Didn't get it? Check spam, or
          <button
            type="button"
            class="text-button"
            :disabled="resendCooldown > 0 || !email"
            data-testid="resend-code"
            @click="resend"
          >
            {{ resendCooldown > 0 ? `resend in ${resendCooldown}s` : 'send a new code' }}
          </button>
        </p>
        <router-link to="/login" class="link">Back to sign in</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import { authAPI } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

defineOptions({ name: 'VerifyEmailPage' })

const RESEND_COOLDOWN_SECONDS = 60

const route = useRoute()
const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const emailFromLink = Boolean(email.value)
const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const resendCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const submit = async () => {
  try {
    const result = await authStore.verifyEmail(email.value, code.value.trim())
    if (result.alreadyVerified) {
      toast.info('Your email is already verified. Please sign in.')
      router.push('/login')
      return
    }
    toast.success('Email verified. Welcome to AniLounge!')
    router.push('/')
  } catch {
    code.value = ''
  }
}

const startCooldown = () => {
  resendCooldown.value = RESEND_COOLDOWN_SECONDS
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

const resend = async () => {
  try {
    await authAPI.resendVerification(email.value)
    toast.success('If that account needs verification, a new code is on its way.')
    startCooldown()
  } catch {
    toast.error('Could not send a new code. Try again in a minute.')
  }
}

onMounted(() => {
  if (email.value && /^\d{6}$/.test(code.value)) submit()
})

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<style scoped>
.code-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
}

.code-container {
  width: 100%;
  max-width: 420px;
  padding: 3rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
}

.code-header {
  margin-bottom: 2rem;
  text-align: center;
}

.code-title {
  margin-bottom: 0.5rem;
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 650;
  color: var(--text-primary);
}

.code-subtitle {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}

.code-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
}

.code-input {
  font-size: 1.5rem;
  letter-spacing: 0.4em;
  text-align: center;
}

.btn-large {
  padding: 1rem;
  font-size: 1.1rem;
}

.error-message {
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--error-color);
  color: white;
  font-size: 0.9rem;
  text-align: center;
}

.code-footer {
  display: grid;
  gap: 0.75rem;
  margin-top: 2rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  text-align: center;
}

.code-footer p {
  margin: 0;
}

.code-note {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.text-button {
  padding: 0;
  border: none;
  background: none;
  color: var(--highlight-color);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.text-button:disabled {
  color: var(--text-muted);
  cursor: default;
}

.link {
  color: var(--highlight-color);
  font-weight: 500;
  text-decoration: none;
}

@media (max-width: 480px) {
  .code-container {
    padding: 2rem 1.5rem;
  }
}
</style>
