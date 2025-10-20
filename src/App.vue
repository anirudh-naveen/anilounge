<template>
  <div id="app" class="min-h-screen">
    <!-- Beta Banner -->
    <BetaBanner />

    <!-- Navigation Header -->
    <header class="header">
      <div class="container">
        <div class="nav-content">
          <div class="logo">
            <router-link to="/" class="logo-link">
              <div class="logo-icon">
                <svg
                  width="50"
                  height="50"
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <!-- TV Screen -->
                  <rect
                    x="4"
                    y="6"
                    width="24"
                    height="16"
                    rx="2"
                    fill="var(--coral-primary)"
                    stroke="var(--teal-primary)"
                    stroke-width="1"
                  />
                  <!-- TV Stand -->
                  <rect x="12" y="22" width="8" height="2" fill="var(--teal-primary)" />
                  <rect x="14" y="24" width="4" height="1" fill="var(--teal-primary)" />
                  <!-- Screen Content -->
                  <rect
                    x="6"
                    y="8"
                    width="20"
                    height="12"
                    rx="1"
                    fill="var(--blend-color)"
                    opacity="0.8"
                  />
                  <!-- Squiggly Animation Lines -->
                  <path
                    d="M8 10 Q10 8 12 10 T16 10 T20 10 T24 10"
                    stroke="var(--coral-primary)"
                    stroke-width="1.5"
                    fill="none"
                    opacity="0.7"
                  >
                    <animate
                      attributeName="d"
                      dur="2s"
                      repeatCount="indefinite"
                      values="M8 10 Q10 8 12 10 T16 10 T20 10 T24 10;M8 10 Q10 12 12 10 T16 10 T20 10 T24 10;M8 10 Q10 8 12 10 T16 10 T20 10 T24 10"
                    />
                  </path>
                  <path
                    d="M8 14 Q10 12 12 14 T16 14 T20 14 T24 14"
                    stroke="var(--teal-primary)"
                    stroke-width="1.5"
                    fill="none"
                    opacity="0.7"
                  >
                    <animate
                      attributeName="d"
                      dur="2.5s"
                      repeatCount="indefinite"
                      values="M8 14 Q10 12 12 14 T16 14 T20 14 T24 14;M8 14 Q10 16 12 14 T16 14 T20 14 T24 14;M8 14 Q10 12 12 14 T16 14 T20 14 T24 14"
                    />
                  </path>
                  <path
                    d="M8 18 Q10 16 12 18 T16 18 T20 18 T24 18"
                    stroke="var(--coral-primary)"
                    stroke-width="1.5"
                    fill="none"
                    opacity="0.7"
                  >
                    <animate
                      attributeName="d"
                      dur="3s"
                      repeatCount="indefinite"
                      values="M8 18 Q10 16 12 18 T16 18 T20 18 T24 18;M8 18 Q10 20 12 18 T16 18 T20 18 T24 18;M8 18 Q10 16 12 18 T16 18 T20 18 T24 18"
                    />
                  </path>
                </svg>
              </div>
              <h1 class="logo-text">Find Animation</h1>
            </router-link>
          </div>

          <nav class="nav-links">
            <router-link to="/" class="nav-link">
              <span class="nav-text">Home</span>
            </router-link>
            <router-link to="/movies" class="nav-link">
              <span class="nav-text">Movies</span>
            </router-link>
            <router-link to="/tv" class="nav-link">
              <span class="nav-text">TV Shows</span>
            </router-link>
            <router-link to="/search" class="nav-link">
              <span class="nav-text">Search</span>
            </router-link>
            <router-link to="/watchlist" class="nav-link" v-if="authStore.isAuthenticated">
              <span class="nav-text">Watchlist</span>
            </router-link>
          </nav>

          <div class="nav-actions">
            <div v-if="authStore.isAuthenticated" class="user-menu">
              <div class="user-dropdown" :class="{ active: showDropdown }">
                <button @click="toggleDropdown" class="user-trigger">
                  <div class="user-avatar">
                    <img
                      v-if="authStore.user?.profilePicture"
                      :src="getProfilePictureUrl(authStore.user.profilePicture)"
                      alt="Profile Picture"
                      class="profile-picture-nav"
                    />
                    <span v-else class="avatar-placeholder">👤</span>
                  </div>
                  <span class="user-name">{{ authStore.user?.username }}</span>
                  <span class="dropdown-arrow" :class="{ rotated: showDropdown }">▼</span>
                </button>

                <div v-if="showDropdown" class="dropdown-menu">
                  <router-link to="/profile" class="dropdown-item" @click="closeDropdown">
                    <span class="item-text">Profile</span>
                  </router-link>
                  <router-link to="/settings" class="dropdown-item" @click="closeDropdown">
                    <span class="item-text">Settings</span>
                  </router-link>
                  <div class="dropdown-divider"></div>
                  <button @click="handleLogout" class="dropdown-item logout-item">
                    <span class="item-text">Logout</span>
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="auth-buttons">
              <router-link to="/login" class="btn btn-secondary"> Login </router-link>
              <router-link to="/register" class="btn btn-primary"> Register </router-link>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content">
      <router-view />
    </main>

    <!-- Beta Feedback Component -->
    <BetaFeedback />

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <p>&copy; 2024 Find Animation. Discover your next favorite animated content!</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'
import BetaFeedback from '@/components/BetaFeedback.vue'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const showDropdown = ref(false)

onMounted(() => {
  authStore.initAuth()
  // Close dropdown when clicking outside
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
}

const closeDropdown = () => {
  showDropdown.value = false
}

const getProfilePictureUrl = (profilePicture: string) => {
  if (profilePicture.startsWith('http')) {
    return profilePicture
  }
  return `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${profilePicture}`
}

const handleClickOutside = (event: Event) => {
  const target = event.target as HTMLElement
  if (!target.closest('.user-dropdown')) {
    showDropdown.value = false
  }
}

const handleLogout = () => {
  if (confirm('Are you sure you want to logout?')) {
    authStore.logout()
    toast.success('Logged out successfully!')
    router.push('/')
    closeDropdown()
  }
}
</script>

<style scoped>
.header {
  background: linear-gradient(90deg, var(--navbar-primary), var(--navbar-secondary));
  border-bottom: 1px solid var(--navbar-accent);
  padding: 1.25rem 0;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
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
  display: flex;
  align-items: center;
  text-decoration: none;
  transition: transform 0.3s ease;
}

.logo-link:hover {
  transform: scale(1.05);
}

.logo-text {
  font-size: 1.6rem;
  font-weight: 800;
  background: linear-gradient(90deg, var(--coral-primary), var(--teal-primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.logo-icon {
  margin-right: 1rem;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.logo-link {
  display: flex;
  align-items: center;
  text-decoration: none;
  transition: transform 0.3s ease;
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
  background: var(--navbar-accent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 20, 140, 0.3);
}

.nav-icon {
  font-size: 1.1rem;
  transition: transform 0.3s ease;
}

.nav-link:hover .nav-icon {
  transform: scale(1.1);
}

.nav-text {
  font-size: 1rem;
  white-space: nowrap;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-menu {
  position: relative;
}

.user-dropdown {
  position: relative;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--bg-card);
  border-radius: 25px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.user-trigger:hover {
  background: var(--navbar-accent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 20, 140, 0.3);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--blend-color);
}

.profile-picture-nav {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 1.2rem;
  color: white;
}

.user-name {
  color: var(--text-primary);
  font-weight: 600;
}

.dropdown-arrow {
  font-size: 0.8rem;
  transition: transform 0.3s ease;
  color: var(--text-secondary);
}

.dropdown-arrow.rotated {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  min-width: 180px;
  z-index: 1000;
  overflow: hidden;
  animation: dropdownSlide 0.2s ease-out;
}

@keyframes dropdownSlide {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  color: var(--text-primary);
  text-decoration: none;
  transition: background-color 0.2s ease;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-size: 0.9rem;
}

.dropdown-item:hover {
  background: var(--bg-hover);
}

.dropdown-item.logout-item {
  color: #dc3545;
}

.dropdown-item.logout-item:hover {
  background: rgba(220, 53, 69, 0.1);
}

.item-icon {
  font-size: 1rem;
  width: 16px;
  text-align: center;
}

.item-text {
  font-weight: 500;
}

.dropdown-divider {
  height: 1px;
  background: var(--border-color);
  margin: 0.25rem 0;
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
