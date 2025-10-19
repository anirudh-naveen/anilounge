<template>
  <div class="register-page">
    <div class="container">
      <div class="register-container">
        <div class="register-header">
          <h1 class="register-title">📝 Sign Up</h1>
          <p class="register-subtitle">Create your account to start tracking animated content</p>
        </div>

        <form @submit.prevent="handleRegister" class="register-form">
          <div class="form-group">
            <label for="username" class="form-label">Username</label>
            <input
              id="username"
              v-model="form.username"
              type="text"
              class="input"
              placeholder="Choose a username"
              required
              minlength="3"
              maxlength="30"
            />
          </div>

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

          <div class="form-group">
            <label for="password" class="form-label">Password</label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              class="input"
              placeholder="Create a password"
              required
              minlength="8"
            />
          </div>

          <div class="form-group">
            <label for="confirmPassword" class="form-label">Confirm Password</label>
            <input
              id="confirmPassword"
              v-model="form.confirmPassword"
              type="password"
              class="input"
              placeholder="Confirm your password"
              required
              minlength="8"
            />
            <div
              v-if="form.confirmPassword && form.password !== form.confirmPassword"
              class="error-text"
            >
              Passwords do not match
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-large" :disabled="authStore.isLoading">
            <span v-if="authStore.isLoading" class="spinner"></span>
            {{ authStore.isLoading ? 'Creating account...' : 'Create Account' }}
          </button>

          <div v-if="authStore.error" class="error-message">
            {{ authStore.error }}
          </div>
        </form>

        <div class="register-footer">
          <p>
            Already have an account? <router-link to="/login" class="link">Sign in</router-link>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const form = ref({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const handleRegister = async () => {
  // Validate password match
  if (form.value.password !== form.value.confirmPassword) {
    toast.error('Passwords do not match')
    return
  }

  // Validate password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
  if (!passwordRegex.test(form.value.password)) {
    toast.error(
      'Password requirements:\n• Minimum eight characters\n• At least one uppercase letter\n• One lowercase letter\n• One number\n• One special character',
    )
    return
  }

  try {
    await authStore.register(form.value)
    toast.success('Account created successfully!')
    router.push('/')
  } catch (error) {
    toast.error('Registration failed. Please try again.')
  }
}
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 0;
}

.register-container {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 3rem;
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
}

.register-header {
  text-align: center;
  margin-bottom: 2rem;
}

.register-title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, var(--highlight-color), var(--purple-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.register-subtitle {
  color: var(--text-secondary);
  font-size: 1rem;
}

.register-form {
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
  display: flex;
  align-items: center;
  justify-content: center;
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

.error-text {
  color: var(--error-color);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.register-footer {
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
  .register-container {
    padding: 2rem;
    margin: 1rem;
  }
}
</style>
