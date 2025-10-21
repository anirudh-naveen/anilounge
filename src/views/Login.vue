<template>
  <div class="login-page">
    <div class="container">
      <div class="login-container">
        <div class="login-header">
          <h1 class="login-title">Login</h1>
          <p class="login-subtitle">Welcome back! Sign in to your account</p>
        </div>

        <form @submit.prevent="handleLogin" class="login-form">
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
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" class="btn btn-primary btn-large" :disabled="authStore.isLoading">
            <span v-if="authStore.isLoading" class="spinner"></span>
            {{ authStore.isLoading ? 'Signing in...' : 'Sign In' }}
          </button>

          <div v-if="authStore.error" class="error-message">
            {{ authStore.error }}
          </div>
        </form>

        <div class="login-footer">
          <p>
            Don't have an account? <router-link to="/register" class="link">Sign up</router-link>
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

// Component name for Vue devtools
defineOptions({
  name: 'LoginPage',
})

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const form = ref({
  email: '',
  password: '',
})

const handleLogin = async () => {
  try {
    await authStore.login(form.value)
    toast.success('Login successful!')

    // Wait for next tick to ensure auth state is updated
    await new Promise((resolve) => setTimeout(resolve, 100))

    router.push('/')
  } catch {
    // Error is already set in the auth store, just show toast
    toast.error(authStore.error || 'Login failed. Please check your credentials.')
  }
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

.login-container {
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
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, var(--highlight-color), var(--purple-accent));
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
  .login-container {
    padding: 2rem;
    margin: 1rem;
  }
}
</style>
