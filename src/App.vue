<template>
  <div id="app" class="min-h-screen">
    <!-- Navigation Header -->
    <header class="header">
      <div class="container">
        <div class="nav-content">
          <div class="logo">
            <router-link to="/" class="logo-link">
              <h1 class="logo-text">🎬 Find Animation</h1>
            </router-link>
          </div>

          <nav class="nav-links">
            <router-link to="/" class="nav-link">
              <span class="nav-icon">🏠</span>
              <span class="nav-text">Home</span>
            </router-link>
            <router-link to="/movies" class="nav-link">
              <span class="nav-icon">🎬</span>
              <span class="nav-text">Movies</span>
            </router-link>
            <router-link to="/tv" class="nav-link">
              <span class="nav-icon">📺</span>
              <span class="nav-text">TV Shows</span>
            </router-link>
            <router-link to="/search" class="nav-link">
              <span class="nav-icon">🔍</span>
              <span class="nav-text">Search</span>
            </router-link>
            <router-link to="/watchlist" class="nav-link" v-if="authStore.isAuthenticated">
              <span class="nav-icon">📋</span>
              <span class="nav-text">Watchlist</span>
            </router-link>
          </nav>

          <div class="nav-actions">
            <div v-if="authStore.isAuthenticated" class="user-menu">
              <div class="user-info">
                <span class="user-avatar">👤</span>
                <span class="user-name">{{ authStore.user?.username }}</span>
              </div>
              <button @click="handleLogout" class="btn btn-logout">
                <span class="btn-icon">🚪</span>
                <span class="btn-text">Logout</span>
              </button>
            </div>
            <div v-else class="auth-buttons">
              <router-link to="/login" class="btn btn-secondary">
                <span class="btn-icon">🔑</span>
                <span class="btn-text">Login</span>
              </router-link>
              <router-link to="/register" class="btn btn-primary">
                <span class="btn-icon">✨</span>
                <span class="btn-text">Register</span>
              </router-link>
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
  padding: 0.75rem 0;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
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
  gap: 1.5rem;
}

.logo-link {
  text-decoration: none;
  transition: transform 0.3s ease;
}

.logo-link:hover {
  transform: scale(1.05);
}

.logo-text {
  font-size: 1.4rem;
  font-weight: 800;
  background: linear-gradient(135deg, var(--highlight-color), var(--purple-accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.nav-links {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  justify-content: center;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.nav-link::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.5s ease;
}

.nav-link:hover::before {
  left: 100%;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: var(--text-primary);
  background: var(--bg-hover);
  transform: translateY(-1px);
}

.nav-icon {
  font-size: 1.1rem;
  transition: transform 0.3s ease;
}

.nav-link:hover .nav-icon {
  transform: scale(1.1);
}

.nav-text {
  font-size: 0.95rem;
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

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--bg-card);
  border-radius: 25px;
  border: 1px solid var(--border-color);
}

.user-avatar {
  font-size: 1.2rem;
}

.user-name {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.9rem;
}

.auth-buttons {
  display: flex;
  gap: 0.75rem;
}

.btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  text-decoration: none;
  position: relative;
  overflow: hidden;
}

.btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.btn:hover::before {
  left: 100%;
}

.btn-primary {
  background: linear-gradient(135deg, var(--highlight-color), var(--purple-accent));
  color: var(--text-primary);
  box-shadow: 0 4px 15px rgba(83, 52, 131, 0.3);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(83, 52, 131, 0.4);
}

.btn-secondary {
  background: var(--bg-card);
  color: var(--highlight-color);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--highlight-color);
  transform: translateY(-2px);
}

.btn-logout {
  background: var(--error-color);
  color: white;
  border: none;
}

.btn-logout:hover {
  background: #d32f2f;
  transform: translateY(-2px);
}

.btn-icon {
  font-size: 1rem;
  transition: transform 0.3s ease;
}

.btn:hover .btn-icon {
  transform: scale(1.1);
}

.btn-text {
  font-size: 0.9rem;
}

.main-content {
  min-height: calc(100vh - 100px);
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
    gap: 0.25rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .nav-link {
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
  }

  .nav-text {
    display: none;
  }

  .nav-actions {
    order: 3;
  }

  .logo {
    order: 1;
  }

  .user-info {
    padding: 0.4rem 0.8rem;
  }

  .user-name {
    font-size: 0.8rem;
  }

  .btn {
    padding: 0.6rem 1rem;
    font-size: 0.8rem;
  }

  .btn-text {
    display: none;
  }
}

@media (max-width: 480px) {
  .header {
    padding: 0.5rem 0;
  }

  .nav-links {
    gap: 0.1rem;
  }

  .nav-link {
    padding: 0.4rem 0.6rem;
  }

  .auth-buttons {
    gap: 0.5rem;
  }
}
</style>
