<!--
  ResetPassword.vue — forgotten-password recovery view.

  Step one emails a reset code to the address entered; step two takes that code
  and a new password. The reset email's link pre-fills `email` and `code` and
  opens straight on step two. A successful reset signs out every session, so the
  user signs in again with the new password.
-->
<template>
  <div class="code-page">
    <div class="code-container">
      <!-- Page Header -->
      <div class="code-header">
        <h1 class="code-title">Reset Your Password</h1>
        <p v-if="step !== 'done'" class="code-subtitle">
          {{
            step === 'request'
              ? "Enter your account's email and we'll send you a reset code."
              : `Enter the code we emailed to ${email || 'you'} and choose a new password.`
          }}
        </p>
      </div>

      <!-- Title: Done -->
      <div v-if="step === 'done'" class="success-panel" data-testid="reset-success">
        <p>Your password has been reset. Sign in with your new password.</p>
        <router-link :to="{ name: 'login' }" class="btn btn-primary btn-large">
          Go to sign in
        </router-link>
      </div>

      <!-- Title: Request code -->
      <form
        v-else-if="step === 'request'"
        class="code-form"
        data-testid="forgot-form"
        @submit.prevent="requestCode"
      >
        <div class="form-group">
          <label for="reset-email" class="form-label">Email</label>
          <input
            id="reset-email"
            v-model="email"
            type="email"
            class="input"
            autocomplete="email"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          {{ isSubmitting ? 'Sending...' : 'Send reset code' }}
        </button>
        <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      </form>

      <!-- Title: New password -->
      <form v-else class="code-form" data-testid="reset-form" @submit.prevent="submitReset">
        <div v-if="notice" class="notice">{{ notice }}</div>
        <div class="form-group">
          <label for="reset-code" class="form-label">Reset code</label>
          <input
            id="reset-code"
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
        <div class="form-group">
          <label for="reset-password" class="form-label">New password</label>
          <PasswordInput
            id="reset-password"
            v-model="password"
            class="input"
            autocomplete="new-password"
            placeholder="Create a new password"
            required
          />
        </div>
        <div class="form-group">
          <label for="reset-confirm" class="form-label">Confirm new password</label>
          <PasswordInput
            id="reset-confirm"
            v-model="confirmPassword"
            class="input"
            autocomplete="new-password"
            placeholder="Confirm your new password"
            required
          />
        </div>
        <p class="hint">
          At least 8 characters with an uppercase letter, a lowercase letter, a number, and a
          special character (@$!%*?&).
        </p>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          {{ isSubmitting ? 'Resetting...' : 'Reset password' }}
        </button>
        <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
        <button type="button" class="text-button" :disabled="isSubmitting" @click="startOver">
          Send a new code
        </button>
      </form>

      <!-- Footer -->
      <div class="code-footer">
        <router-link to="/login" class="link">Back to sign in</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PasswordInput from '@/components/PasswordInput.vue'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { authAPI } from '@/services/api'
import { usePageTitle } from '@/composables/usePageMeta'

usePageTitle('Reset password')

defineOptions({ name: 'ResetPasswordPage' })

/** Matches the registration and reset-password route rules. */
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/

const route = useRoute()

const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const password = ref('')
const confirmPassword = ref('')
const step = ref<'request' | 'reset' | 'done'>(email.value && code.value ? 'reset' : 'request')
const isSubmitting = ref(false)
const errorMessage = ref('')
const notice = ref('')

/**
 * Message from an API error response, or `fallback`.
 * @param err - Rejection from an `authAPI` call.
 * @param fallback - Shown when the server sent no message.
 */
const apiMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback

const requestCode = async () => {
  isSubmitting.value = true
  errorMessage.value = ''
  try {
    const { data } = await authAPI.forgotPassword(email.value.trim())
    notice.value = data.message
    code.value = ''
    step.value = 'reset'
  } catch (err) {
    errorMessage.value = apiMessage(err, 'Could not send a reset code.')
  } finally {
    isSubmitting.value = false
  }
}

const submitReset = async () => {
  errorMessage.value = ''
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }
  if (!PASSWORD_RULE.test(password.value)) {
    errorMessage.value = 'That password does not meet the requirements below.'
    return
  }
  isSubmitting.value = true
  try {
    await authAPI.resetPassword(email.value.trim(), code.value.trim(), password.value)
    step.value = 'done'
  } catch (err) {
    errorMessage.value = apiMessage(err, 'Could not reset the password.')
  } finally {
    isSubmitting.value = false
  }
}

const startOver = () => {
  errorMessage.value = ''
  notice.value = ''
  step.value = 'request'
}
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

.hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.notice {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.9rem;
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

.text-button {
  padding: 0;
  border: none;
  background: none;
  color: var(--highlight-color);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.text-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.code-footer {
  margin-top: 2rem;
  font-size: 0.9rem;
  text-align: center;
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
