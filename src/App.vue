<template>
  <div id="app" class="min-h-screen">
    <!-- Navigation Header -->
    <header class="header">
      <div class="container">
        <div class="nav-content">
          <div class="logo">
            <h1 class="logo-text">🎬 Find Animation</h1>
          </div>

          <nav class="nav-links">
            <router-link to="/" class="nav-link">Home</router-link>
            <router-link to="/movies" class="nav-link">Movies</router-link>
            <router-link to="/tv" class="nav-link">TV Shows</router-link>
            <router-link to="/search" class="nav-link">Search</router-link>
            <router-link to="/watchlist" class="nav-link" v-if="authStore.isAuthenticated"
              >Watchlist</router-link
            >
          </nav>

          <div class="nav-actions">
            <div v-if="authStore.isAuthenticated" class="user-menu">
              <span class="user-name">{{ authStore.user?.username }}</span>
              <button @click="handleLogout" class="btn btn-secondary">Logout</button>
            </div>
            <div v-else class="auth-buttons">
              <router-link to="/login" class="btn btn-secondary">Login</router-link>
              <router-link to="/register" class="btn btn-primary">Register</router-link>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content">
      <router-view />
    </main>

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <p>&copy; 2024 Find Animation. Discover your next favorite animated content!</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

onMounted(() => {
  authStore.initAuth()
})

const handleLogout = () => {
  authStore.logout()
  toast.success('Logged out successfully!')
  router.push('/')
}
</script>

<style scoped>
.header {
  background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
  border-bottom: 1px solid var(--border-color);
  padding: 1rem 0;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

.logo-text {
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--highlight-color), var(--purple-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.nav-links {
  display: flex;
  gap: 2rem;
  flex: 1;
  justify-content: center;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-menu {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-name {
  color: var(--text-primary);
  font-weight: 500;
}

.auth-buttons {
  display: flex;
  gap: 0.5rem;
}

.main-content {
  min-height: calc(100vh - 140px);
  padding: 2rem 0;
}

.footer {
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  padding: 2rem 0;
  text-align: center;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .nav-content {
    flex-direction: column;
    gap: 1rem;
  }

  .nav-links {
    order: 2;
    gap: 1rem;
  }

  .nav-actions {
    order: 3;
  }

  .logo {
    order: 1;
  }
}
</style>
