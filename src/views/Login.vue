<!--
  Login.vue — authentication view.

  Email/password sign-in form against the auth store, followed by an
  authenticator-code step for accounts with 2FA. Unverified accounts are sent
  to email verification; locked accounts get a link to the unlock page.
  `?redirect=/path` (an in-site path) is where signing in returns to.
-->
<template>
  <div class="login-page">
    <div class="container">
      <div class="login-container">
        <!-- Page Header -->
        <div class="login-header">
          <h1 class="login-title">Login</h1>
          <p class="login-subtitle">Welcome back to the lobby</p>
        </div>

        <!-- Two-Factor -->
        <!-- Title: Code Step -->
        <form
          v-if="challengeToken"
          class="login-form"
          data-testid="two-factor-form"
          @submit.prevent="handleTwoFactor"
        >
          <p class="step-hint">
            Enter the 6-digit code from your authenticator app, or one of your backup codes.
          </p>
          <div class="form-group">
            <label for="two-factor-code" class="form-label">Verification code</label>
            <input
              id="two-factor-code"
              v-model="twoFactorCode"
              type="text"
              class="input code-input"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="123456"
              maxlength="9"
              required
            />
          </div>
          <button type="submit" class="btn btn-primary btn-large" :disabled="authStore.isLoading">
            {{ authStore.isLoading ? 'Verifying...' : 'Verify' }}
          </button>
          <div v-if="authStore.error" class="error-message">{{ authStore.error }}</div>
          <button type="button" class="text-button" @click="resetTwoFactor">
            Use a different account
          </button>
        </form>

        <!-- Form -->
        <form v-else @submit.prevent="handleLogin" class="login-form">
          <!-- Title: Email -->
          <div class="form-group">
            <label for="email" class="form-label">Email</label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              class="input"
              placeholder="Enter your email"
              required
            />
          </div>

          <!-- Title: Password -->
          <div class="form-group">
            <label for="password" class="form-label">Password</label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              class="input"
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" class="btn btn-primary btn-large" :disabled="authStore.isLoading">
            <span v-if="authStore.isLoading" class="spinner"></span>
            {{ authStore.isLoading ? 'Signing in...' : 'Sign In' }}
          </button>

          <!-- Title: Error -->
          <div v-if="authStore.error" class="error-message">
            {{ authStore.error }}
            <router-link
              v-if="authStore.errorCode === 'ACCOUNT_LOCKED'"
              :to="{ name: 'unlockAccount', query: { email: form.email } }"
              class="error-link"
            >
              I have an unlock code
            </router-link>
          </div>
        </form>

        <!-- Footer -->
        <div class="login-footer">
          <p>
            Don't have an account?
            <router-link :to="{ path: '/register', query: route.query }" class="link"
              >Sign up</router-link
            >
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'
import { safeRedirect } from '@/utils/social'

// Component name for Vue devtools
defineOptions({
  name: 'LoginPage',
})

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const form = ref({
  email: '',
  password: '',
})
const challengeToken = ref<string | null>(null)
const twoFactorCode = ref('')

const finishLogin = async () => {
  toast.success('Login successful!')
  // Wait for next tick to ensure auth state is updated
  await new Promise((resolve) => setTimeout(resolve, 100))
  router.push(safeRedirect(route.query.redirect))
}

const handleLogin = async () => {
  try {
    const result = await authStore.login(form.value)
    if (result.requiresTwoFactor) {
      challengeToken.value = result.challengeToken
      twoFactorCode.value = ''
      return
    }
    await finishLogin()
  } catch {
    if (authStore.errorCode === 'EMAIL_NOT_VERIFIED') {
      toast.info('Please verify your email to finish signing up.')
      router.push({ name: 'verifyEmail', query: { email: form.value.email } })
      return
    }
    // Error is already set in the auth store, just show toast
    toast.error(authStore.error || 'Login failed. Please check your credentials.')
  }
}

const handleTwoFactor = async () => {
  if (!challengeToken.value) return
  try {
    await authStore.verifyTwoFactor(challengeToken.value, twoFactorCode.value.trim())
    await finishLogin()
  } catch {
    if (authStore.errorCode === 'CHALLENGE_EXPIRED' || authStore.errorCode === 'ACCOUNT_LOCKED') {
      challengeToken.value = null
    }
    twoFactorCode.value = ''
    toast.error(authStore.error || 'Verification failed.')
  }
}

const resetTwoFactor = () => {
  challengeToken.value = null
  twoFactorCode.value = ''
  form.value.password = ''
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
}

.login-page .container {
  width: 100%;
  padding: 0 1rem;
}

.login-container {
  margin: 0 auto;
  background: var(--bg-card);
  border-radius: 16px;
  padding: 3rem;
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-title {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 650;
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, var(--coral-primary), var(--tan-primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.login-subtitle {
  color: var(--text-secondary);
  font-size: 1rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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

.btn-large {
  padding: 1rem;
  font-size: 1.1rem;
  line-height: 1.15;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.5rem;
}

.error-message {
  background: var(--error-color);
  color: white;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.9rem;
  text-align: center;
}

.step-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
  text-align: center;
}

.code-input {
  font-size: 1.4rem;
  letter-spacing: 0.3em;
  text-align: center;
}

.text-button {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}

.error-link {
  display: block;
  margin-top: 0.4rem;
  color: white;
  font-weight: 600;
}

.login-footer {
  text-align: center;
  margin-top: 2rem;
  color: var(--text-secondary);
}

.link {
  color: var(--highlight-color);
  text-decoration: none;
  font-weight: 500;
}

.link:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  /* Start under the header instead of centering in the full screen height. */
  .login-page {
    min-height: 0;
    align-items: flex-start;
    padding: 1.5rem 0 2rem;
  }

  .login-container {
    padding: 2rem 1.5rem;
  }
}
</style>
