<!--
  App.vue — root application shell (view).

  Owns site-wide chrome: beta banner, primary navigation, authenticated user
  menu, router outlet, floating AI assistant, and footer.
-->
<template>
  <div id="app" class="min-h-screen">
    <!-- Banner -->
    <BetaBanner />

    <!-- Navigation -->
    <header class="header">
      <div class="container">
        <div class="nav-content">
          <!-- Title: Logo -->
          <div class="logo">
            <router-link to="/" class="logo-link">
              <img src="/anilounge-logo.png" alt="" class="logo-mark" width="44" height="44" />
              <h1 class="logo-text"><span>Ani</span>Lounge</h1>
            </router-link>
          </div>

          <!-- Title: Primary Nav -->
          <nav class="nav-links">
            <router-link to="/" class="nav-link" aria-label="Home" title="Home">
              <span class="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20V10.5Z"
                  />
                </svg>
              </span>
              <span class="nav-text">Home</span>
            </router-link>
            <router-link
              to="/forum"
              class="nav-link nav-link-locked"
              aria-label="Forum (coming soon)"
              title="Forum (coming soon)"
            >
              <span class="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M5.5 16.5h.8l2.2 2.2V16.5H16A2.5 2.5 0 0 0 18.5 14V8A2.5 2.5 0 0 0 16 5.5H8A2.5 2.5 0 0 0 5.5 8v8.5Z"
                  />
                  <path stroke-linecap="round" d="M9 9.5h6M9 12.5h4" />
                </svg>
              </span>
              <span class="nav-text">Forum</span>
              <span class="nav-lock" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="6" y="11" width="12" height="9" rx="1.75" />
                  <path stroke-linecap="round" d="M8.5 11V8.25a3.5 3.5 0 0 1 7 0V11" />
                </svg>
              </span>
            </router-link>
            <router-link to="/movies" class="nav-link" aria-label="Movies" title="Movies">
              <span class="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path
                    stroke-linecap="round"
                    d="M8 5v14M16 5v14M3 9.5h5M3 14.5h5M16 9.5h5M16 14.5h5"
                  />
                </svg>
              </span>
              <span class="nav-text">Movies</span>
            </router-link>
            <router-link to="/tv" class="nav-link" aria-label="Series" title="Series">
              <span class="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <rect x="2.5" y="6.5" width="19" height="12.5" rx="2" />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8 3.5 12 6.5 16 3.5M8 22.5h8"
                  />
                </svg>
              </span>
              <span class="nav-text">Series</span>
            </router-link>
            <router-link to="/search" class="nav-link" aria-label="Search" title="Search">
              <span class="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <circle cx="11" cy="11" r="6.25" />
                  <path stroke-linecap="round" d="m16 16 4.25 4.25" />
                </svg>
              </span>
              <span class="nav-text">Search</span>
            </router-link>
            <router-link
              to="/watchlist"
              class="nav-link"
              v-if="authStore.isAuthenticated"
              aria-label="Watchlist"
              title="Watchlist"
            >
              <span class="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M7 3.75h10A1.75 1.75 0 0 1 18.75 5.5v15.1L12 16.75 5.25 20.6V5.5A1.75 1.75 0 0 1 7 3.75Z"
                  />
                </svg>
              </span>
              <span class="nav-text">Watchlist</span>
            </router-link>
          </nav>

          <!-- Title: User Menu / Auth Actions -->
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
                    <span v-else class="avatar-placeholder" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4.5 20.25c0-3.6 3.36-6.25 7.5-6.25s7.5 2.65 7.5 6.25" />
                      </svg>
                    </span>
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

    <!-- Page -->
    <!-- Title: Router Outlet -->
    <main class="main-content">
      <router-view :key="route.path" />
    </main>

    <!-- Overlays -->
    <!-- Title: AI Assistant -->
    <ChatLauncher />

    <!-- Footer -->
    <!-- Title: Copyright -->
    <footer class="footer">
      <div class="container">
        <p>&copy; 2026 AniLounge. Created by Anirudh Naveen.</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'
import ChatLauncher from '@/components/ChatLauncher.vue'
import BetaBanner from '@/components/BetaBanner.vue'
import { API_HOST } from '@/services/api'

const router = useRouter()
const route = useRoute()
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
  return `${API_HOST}${profilePicture}`
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
  background: linear-gradient(90deg, rgba(21, 34, 56, 0.97), rgba(27, 42, 74, 0.96));
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0.9rem 0;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(18px);
  box-shadow: 0 10px 28px rgba(21, 34, 56, 0.18);
}

.header::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--coral-primary), var(--teal-light));
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
  gap: 0.75rem;
  transition: transform 0.3s ease;
}

.logo-link:hover {
  transform: translateY(-1px);
}

.logo-mark {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: block;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.logo-text {
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 650;
  letter-spacing: -0.03em;
  color: #f7f8fa;
  margin: 0;
}

.logo-text span {
  color: var(--coral-light);
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
  gap: 0.4rem;
  color: #e8edf5;
  text-decoration: none;
  font-weight: 500;
  padding: 0.6rem 0.9rem;
  border-radius: 999px;
  transition: all 0.25s ease;
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
.nav-link.router-link-exact-active {
  color: #ffffff;
  background: rgba(224, 122, 95, 0.22);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(224, 122, 95, 0.18);
}

.nav-link-locked {
  color: rgba(232, 237, 245, 0.72);
}

.nav-lock {
  width: 12px;
  height: 12px;
  display: inline-flex;
  color: var(--tan-primary);
  flex-shrink: 0;
}

.nav-lock svg {
  width: 100%;
  height: 100%;
  display: block;
}

.nav-icon {
  display: none;
  width: 22px;
  height: 22px;
  color: var(--tan-light);
  transition:
    transform 0.3s ease,
    color 0.3s ease;
}

.nav-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}

.nav-link:hover .nav-icon,
.nav-link.router-link-exact-active .nav-icon {
  color: var(--coral-light);
  transform: scale(1.08);
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
  padding: 0.45rem 0.9rem;
  background: rgba(247, 240, 232, 0.1);
  border-radius: 25px;
  border: 1px solid rgba(232, 213, 181, 0.22);
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--tan-light);
}

.user-trigger:hover {
  background: rgba(224, 122, 95, 0.22);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(224, 122, 95, 0.18);
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--text-on-accent);
}

.avatar-placeholder svg {
  width: 18px;
  height: 18px;
}

.user-name {
  color: var(--tan-light);
  font-weight: 600;
}

.dropdown-arrow {
  font-size: 0.8rem;
  transition: transform 0.3s ease;
  color: var(--tan-light);
}

.dropdown-arrow.rotated {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: var(--bg-parchment);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
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
  background: linear-gradient(135deg, var(--coral-light), var(--coral-primary));
  color: var(--text-on-accent);
  box-shadow: 0 8px 18px rgba(224, 122, 95, 0.24);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(224, 122, 95, 0.32);
}

.btn-secondary {
  background: rgba(247, 248, 250, 0.1);
  color: #e8edf5;
  border: 1px solid rgba(247, 248, 250, 0.22);
}

.btn-secondary:hover {
  background: rgba(224, 122, 95, 0.22);
  color: #ffffff;
  border-color: var(--coral-light);
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
  background: #eef0f4;
  border-top: 1px solid var(--border-color);
  padding: 1.75rem 0;
  text-align: center;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

@media (max-width: 768px) {
  .nav-content {
    flex-direction: column;
    gap: 1rem;
  }

  .nav-links {
    order: 2;
    gap: 0.15rem;
    flex-wrap: nowrap;
    justify-content: space-around;
    width: 100%;
  }

  .nav-link {
    flex: 1;
    justify-content: center;
    padding: 0.5rem 0.35rem;
    font-size: 0.85rem;
  }

  .nav-icon {
    display: block;
  }

  .nav-text {
    display: none;
  }

  .nav-link-locked {
    position: relative;
  }

  .nav-lock {
    position: absolute;
    top: 2px;
    right: 6px;
    width: 10px;
    height: 10px;
    color: var(--coral-light);
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
