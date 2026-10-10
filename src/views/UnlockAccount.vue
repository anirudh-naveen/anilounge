<!--
  UnlockAccount.vue — locked-account recovery view.

  Opened from the lockout email (which pre-fills `email` and `code` and submits
  automatically) or from the login error. A valid code clears the lockout.
-->
<template>
  <div class="code-page">
    <div class="code-container">
      <!-- Page Header -->
      <div class="code-header">
        <h1 class="code-title">Unlock your account</h1>
        <p class="code-subtitle">
          Enter the code from the "account locked" email we sent after several failed sign-ins.
        </p>
      </div>

      <!-- Title: Unlocked -->
      <div v-if="unlocked" class="success-panel" data-testid="unlock-success">
        <p>Your account is unlocked. You can sign in now.</p>
        <router-link to="/login" class="btn btn-primary btn-large">Go to sign in</router-link>
      </div>

      <!-- Form -->
      <form v-else class="code-form" data-testid="unlock-form" @submit.prevent="submit">
        <div class="form-group">
          <label for="unlock-email" class="form-label">Email</label>
          <input id="unlock-email" v-model="email" type="email" class="input" required />
        </div>
        <div class="form-group">
          <label for="unlock-code" class="form-label">Unlock code</label>
          <input
            id="unlock-code"
            v-model="code"
            type="text"
            class="input code-input"
            inputmode="numeric"
            maxlength="6"
            placeholder="123456"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          {{ isSubmitting ? 'Unlocking...' : 'Unlock account' }}
        </button>
        <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      </form>

      <!-- Footer -->
      <div class="code-footer">
        <p>No email? The lock also lifts on its own after 30 minutes.</p>
        <router-link to="/login" class="link">Back to sign in</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { authAPI } from '@/services/api'
import { usePageTitle } from '@/composables/usePageMeta'

usePageTitle('Unlock account')

defineOptions({ name: 'UnlockAccountPage' })

const route = useRoute()

const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const isSubmitting = ref(false)
const unlocked = ref(false)
const errorMessage = ref('')

const submit = async () => {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    await authAPI.unlockAccount(email.value, code.value.trim())
    unlocked.value = true
  } catch (err) {
    const apiError = err as { response?: { data?: { message?: string } } }
    errorMessage.value = apiError.response?.data?.message || 'Could not unlock the account.'
    code.value = ''
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  if (email.value && /^\d{6}$/.test(code.value)) submit()
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
}

.code-form,
.success-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.success-panel p {
  margin: 0;
  color: var(--text-primary);
  text-align: center;
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
