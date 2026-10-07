<!--
  App.vue — root application shell (view).

  Owns site-wide chrome: beta banner, primary navigation, authenticated user
  menu, router outlet, and footer. The AI assistant lives in the Search view.
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
            <router-link to="/forum" class="nav-link" aria-label="Forum" title="Forum">
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
            <router-link to="/search" class="nav-link" aria-label="Search" title="Search">
              <span class="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <circle cx="11" cy="11" r="6.25" />
                  <path stroke-linecap="round" d="m16 16 4.25 4.25" />
                </svg>
              </span>
              <span class="nav-text">Search</span>
            </router-link>
          </nav>

          <!-- Title: User Menu / Auth Actions -->
          <div class="nav-actions">
            <div v-if="authStore.isAuthenticated" class="user-menu">
              <div class="user-dropdown" :class="{ active: showDropdown }">
                <button @click="toggleDropdown" class="user-trigger">
                  <UserAvatar
                    :src="authStore.user?.profilePicture"
                    :name="authStore.user?.username"
                    :size="32"
                    data-testid="nav-avatar"
                  />
                  <span class="user-name">{{ authStore.user?.username }}</span>
                  <span
                    v-if="messagesStore.total || inboxStore.counts.total"
                    class="unread-dot"
                    data-testid="nav-unread-dot"
                    aria-label="Unread messages or notifications"
                  ></span>
                  <span class="dropdown-arrow" :class="{ rotated: showDropdown }">▼</span>
                </button>

                <div v-if="showDropdown" class="dropdown-menu">
                  <router-link to="/profile" class="dropdown-item" @click="closeDropdown">
                    <span class="item-text">Profile</span>
                    <span class="item-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <circle cx="12" cy="8" r="3.5" />
                        <path d="M5 20a7 7 0 0 1 14 0" />
                      </svg>
                    </span>
                  </router-link>
                  <router-link
                    to="/friends"
                    class="dropdown-item"
                    data-testid="nav-friends"
                    @click="closeDropdown"
                  >
                    <span class="item-text">Friends</span>
                    <span
                      v-if="messagesStore.total"
                      class="item-count"
                      :aria-label="`${messagesStore.total} unread`"
                      >{{ messagesStore.total > 99 ? '99+' : messagesStore.total }}</span
                    >
                    <span class="item-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <circle cx="9" cy="8.5" r="3" />
                        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                        <path d="M15.5 5.75a3 3 0 0 1 0 5.5M17 14a5.5 5.5 0 0 1 3.5 5" />
                      </svg>
                    </span>
                  </router-link>
                  <router-link
                    to="/inbox"
                    class="dropdown-item"
                    data-testid="nav-inbox"
                    @click="closeDropdown"
                  >
                    <span class="item-text">Inbox</span>
                    <span
                      v-if="inboxStore.counts.total"
                      class="item-count"
                      :aria-label="`${inboxStore.counts.total} new`"
                      >{{ inboxStore.counts.total > 99 ? '99+' : inboxStore.counts.total }}</span
                    >
                    <span class="item-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M4 13.5 6.2 6A2 2 0 0 1 8.1 4.5h7.8A2 2 0 0 1 17.8 6l2.2 7.5" />
                        <path
                          d="M4 13.5h4.5l1 2h5l1-2H20V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-4.5Z"
                        />
                      </svg>
                    </span>
                  </router-link>
                  <router-link to="/import" class="dropdown-item" @click="closeDropdown">
                    <span class="item-text">Import</span>
                    <span class="item-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
                        <path d="M4.5 15.5v2A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-2" />
                      </svg>
                    </span>
                  </router-link>
                  <router-link
                    v-if="authStore.canEditContent"
                    to="/admin"
                    class="dropdown-item"
                    @click="closeDropdown"
                  >
                    <span class="item-text">{{
                      authStore.isAdmin ? 'Admin' : 'Edit content'
                    }}</span>
                    <span class="item-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path
                          d="M12 3.5 5 6.25v5.25c0 4.25 3 7.5 7 9 4-1.5 7-4.75 7-9V6.25L12 3.5Z"
                        />
                        <path d="m9.25 12 2 2 3.5-3.75" />
                      </svg>
                    </span>
                  </router-link>
                  <router-link to="/settings" class="dropdown-item" @click="closeDropdown">
                    <span class="item-text">Settings</span>
                    <span class="item-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path
                          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                        />
                      </svg>
                    </span>
                  </router-link>
                  <div class="dropdown-divider"></div>
                  <button @click="handleLogout" class="dropdown-item logout-item">
                    <span class="item-text">Logout</span>
                    <span class="item-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.75"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M14 4.5h3A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5h-3" />
                        <path d="M10 8 6 12l4 4M6 12h9.5" />
                      </svg>
                    </span>
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
import { onMounted, ref, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFavoritesStore } from '@/stores/favorites'
import { useMessagesStore } from '@/stores/messages'
import { useInboxStore } from '@/stores/inbox'
import { useTheme } from '@/composables/useTheme'
import { useToast } from 'vue-toastification'
import BetaBanner from '@/components/BetaBanner.vue'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const toast = useToast()

const showDropdown = ref(false)
const messagesStore = useMessagesStore()
const inboxStore = useInboxStore()

/** How often the profile-menu badges recheck unread messages, requests, and the inbox. */
const UNREAD_POLL_MS = 60_000
let unreadTimer: ReturnType<typeof setInterval> | undefined
// Theme is chosen in Settings; calling this here keeps it applied (and following the OS) site-wide.
useTheme()

onMounted(() => {
  authStore.restoreSession()
  // Close dropdown when clicking outside
  document.addEventListener('click', handleClickOutside)
  unreadTimer = setInterval(() => {
    if (authStore.isAuthenticated && !document.hidden) {
      messagesStore.refresh()
      inboxStore.refresh()
    }
  }, UNREAD_POLL_MS)
})

// Refresh the badge on sign-in and page changes; clear it on sign-out.
watch(
  () => [authStore.isAuthenticated, route.path] as const,
  ([signedIn]) => {
    if (signedIn) {
      messagesStore.refresh()
      inboxStore.refresh()
    } else {
      messagesStore.reset()
      inboxStore.reset()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  clearInterval(unreadTimer)
})

const toggleDropdown = () => {
  showDropdown.value = !showDropdown.value
}

const closeDropdown = () => {
  showDropdown.value = false
}

const handleClickOutside = (event: Event) => {
  const target = event.target as HTMLElement
  if (!target.closest('.user-dropdown')) {
    showDropdown.value = false
  }
}

const handleLogout = async () => {
  if (confirm('Are you sure you want to logout?')) {
    await authStore.logout()
    useFavoritesStore().reset()
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
  display: inline-flex;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  transition: color 0.2s ease;
}

.item-icon svg {
  width: 100%;
  height: 100%;
}

.dropdown-item:hover .item-icon {
  color: var(--coral-primary);
}

.dropdown-item.logout-item .item-icon {
  color: inherit;
}

.item-text {
  flex: 1;
  font-weight: 500;
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--coral-light);
  box-shadow: 0 0 0 2px rgba(21, 34, 56, 0.9);
  flex-shrink: 0;
}

.item-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.3rem;
  height: 1.3rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--coral-primary);
  color: var(--text-on-accent);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
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
  background: var(--bg-secondary);
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
