<template>
  <div class="profile-page">
    <div class="container">
      <div class="page-header">
        <h1>Profile</h1>
        <p>Manage your account information</p>
      </div>

      <div class="profile-content">
        <div class="profile-card">
          <div class="profile-header">
            <div class="avatar">
              <div class="avatar-placeholder">
                {{ userInitials }}
              </div>
            </div>
            <div class="profile-info">
              <h2>{{ authStore.user?.username }}</h2>
              <p class="email">{{ authStore.user?.email }}</p>
              <p class="member-since">Member since {{ formatDate(authStore.user?.id) }}</p>
            </div>
          </div>

          <div class="profile-stats">
            <div class="stat-item">
              <div class="stat-number">{{ watchlistCount }}</div>
              <div class="stat-label">In Watchlist</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">{{ completedCount }}</div>
              <div class="stat-label">Completed</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">{{ ratingsCount }}</div>
              <div class="stat-label">Rated</div>
            </div>
          </div>
        </div>

        <div class="profile-sections">
          <div class="section">
            <h3>Account Information</h3>
            <div class="info-grid">
              <div class="info-item">
                <label>Username</label>
                <span>{{ authStore.user?.username }}</span>
              </div>
              <div class="info-item">
                <label>Email</label>
                <span>{{ authStore.user?.email }}</span>
              </div>
              <div class="info-item">
                <label>Account ID</label>
                <span class="account-id">{{ authStore.user?.id }}</span>
              </div>
            </div>
          </div>

          <div class="section">
            <h3>Preferences</h3>
            <div class="preferences">
              <div class="preference-item">
                <label>Favorite Genres</label>
                <div class="genre-tags">
                  <span v-for="genre in favoriteGenres" :key="genre" class="genre-tag">
                    {{ genre }}
                  </span>
                  <span v-if="!favoriteGenres.length" class="no-preferences">
                    No favorite genres set
                  </span>
                </div>
              </div>
              <div class="preference-item">
                <label>Favorite Studios</label>
                <div class="studio-tags">
                  <span v-for="studio in favoriteStudios" :key="studio" class="studio-tag">
                    {{ studio }}
                  </span>
                  <span v-if="!favoriteStudios.length" class="no-preferences">
                    No favorite studios set
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'

const authStore = useAuthStore()
const contentStore = useContentStore()

const userInitials = computed(() => {
  const username = authStore.user?.username || ''
  return username
    .split(' ')
    .map((name) => name.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const watchlistCount = computed(() => {
  return contentStore.watchlist.length
})

const completedCount = computed(() => {
  return contentStore.watchlist.filter((item) => item.status === 'completed').length
})

const ratingsCount = computed(() => {
  return authStore.user?.ratings?.length || 0
})

const favoriteGenres = computed(() => {
  return authStore.user?.preferences?.favoriteGenres || []
})

const favoriteStudios = computed(() => {
  return authStore.user?.preferences?.favoriteStudios || []
})

const formatDate = (userId: string | undefined) => {
  if (!userId) return 'Unknown'
  // Extract timestamp from ObjectId (first 8 characters are timestamp)
  const timestamp = parseInt(userId.substring(0, 8), 16) * 1000
  return new Date(timestamp).toLocaleDateString()
}
</script>

<style scoped>
.profile-page {
  padding: 2rem 0;
  min-height: calc(100vh - 140px);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 0.5rem;
}

.page-header p {
  font-size: 1.1rem;
  color: #666;
}

.profile-content {
  display: grid;
  gap: 2rem;
}

.profile-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.avatar {
  flex-shrink: 0;
}

.avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
}

.profile-info h2 {
  font-size: 1.8rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 0.25rem;
}

.email {
  color: #666;
  margin-bottom: 0.25rem;
}

.member-since {
  color: #888;
  font-size: 0.9rem;
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
}

.stat-item {
  text-align: center;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  color: #667eea;
  margin-bottom: 0.25rem;
}

.stat-label {
  color: #666;
  font-size: 0.9rem;
}

.profile-sections {
  display: grid;
  gap: 2rem;
}

.section {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.section h3 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 1.5rem;
}

.info-grid {
  display: grid;
  gap: 1rem;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.info-item label {
  font-weight: 600;
  color: #333;
}

.info-item span {
  color: #666;
}

.account-id {
  font-family: monospace;
  font-size: 0.9rem;
}

.preferences {
  display: grid;
  gap: 1.5rem;
}

.preference-item {
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.preference-item label {
  display: block;
  font-weight: 600;
  color: #333;
  margin-bottom: 0.5rem;
}

.genre-tags,
.studio-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.genre-tag,
.studio-tag {
  background: #667eea;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.9rem;
}

.no-preferences {
  color: #888;
  font-style: italic;
}

@media (max-width: 768px) {
  .profile-header {
    flex-direction: column;
    text-align: center;
  }

  .info-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}
</style>
