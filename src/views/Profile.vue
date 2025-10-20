<template>
  <div class="profile-page">
    <div class="container">
      <div class="page-header">
        <h1>Profile</h1>
        <p>Check out this user's account</p>
      </div>

      <div class="profile-content">
        <div class="profile-card">
          <div class="profile-header">
            <div class="avatar">
              <img
                v-if="authStore.user?.profilePicture"
                :src="getProfilePictureUrl(authStore.user.profilePicture)"
                alt="Profile Picture"
                class="profile-picture"
              />
              <div v-else class="avatar-placeholder">
                {{ userInitials }}
              </div>
            </div>
            <div class="profile-info">
              <h2>{{ authStore.user?.username }}</h2>
              <p class="email">{{ authStore.user?.email }}</p>
              <p class="member-since">Member since {{ formatDate(authStore.user?.createdAt) }}</p>
            </div>
          </div>

          <div class="profile-stats">
            <div class="stat-item">
              <div class="stat-number">{{ completedShows }}</div>
              <div class="stat-label">Completed Shows</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">{{ completedMovies }}</div>
              <div class="stat-label">Completed Movies</div>
            </div>
            <div class="stat-item">
              <div class="stat-number">{{ hoursWatched }}h</div>
              <div class="stat-label">Hours Watched</div>
            </div>
            <div class="stat-item">
              <div class="stat-number rating-number" :style="{ color: averageRatingColor }">
                {{ averageRating }}
              </div>
              <div class="stat-label">Avg Rating</div>
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
import { computed, defineOptions } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'
import { getRatingColorHSL } from '@/utils/ratingColors'

defineOptions({ name: 'ProfilePage' })

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

const hoursWatched = computed(() => {
  const totalMinutes = contentStore.watchlist.reduce((total, item) => {
    if (item.status === 'completed' && item.content && typeof item.content === 'object') {
      // For completed items, use total runtime
      const runtime = item.content.runtime || 0
      return total + runtime
    } else if (item.status === 'watching' && item.content && typeof item.content === 'object') {
      // For watching items, calculate based on episodes watched
      const episodesWatched = item.currentEpisode || 0
      const runtimePerEpisode = item.content.runtime || 0
      return total + episodesWatched * runtimePerEpisode
    }
    return total
  }, 0)

  return Math.round(totalMinutes / 60) // Convert minutes to hours
})

const completedShows = computed(() => {
  return contentStore.watchlist.filter(
    (item) =>
      item.status === 'completed' &&
      item.content &&
      typeof item.content === 'object' &&
      item.content.contentType === 'tv',
  ).length
})

const completedMovies = computed(() => {
  return contentStore.watchlist.filter(
    (item) =>
      item.status === 'completed' &&
      item.content &&
      typeof item.content === 'object' &&
      item.content.contentType === 'movie',
  ).length
})

const averageRating = computed(() => {
  const ratedItems = contentStore.watchlist.filter((item) => item.rating && item.rating > 0)
  if (ratedItems.length === 0) return 0

  const totalRating = ratedItems.reduce((sum, item) => sum + (item.rating || 0), 0)
  return Math.round((totalRating / ratedItems.length) * 10) / 10 // Round to 1 decimal place
})

const averageRatingColor = computed(() => {
  return getRatingColorHSL(averageRating.value)
})

const favoriteGenres = computed(() => {
  return authStore.user?.preferences?.favoriteGenres || []
})

const favoriteStudios = computed(() => {
  return authStore.user?.preferences?.favoriteStudios || []
})

const formatDate = (dateString: string | undefined) => {
  if (!dateString) return 'Unknown'
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return 'Unknown'
  }
}

const getProfilePictureUrl = (profilePicture: string) => {
  if (!profilePicture) return ''
  if (profilePicture.startsWith('http')) {
    return profilePicture
  }
  return `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${profilePicture}`
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
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.page-header p {
  font-size: 1.1rem;
  color: var(--text-secondary);
}

.profile-content {
  display: grid;
  gap: 2rem;
}

.profile-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
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
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: white;
}

.profile-picture {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid var(--blend-color);
}

.profile-info h2 {
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.email {
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.member-since {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.stat-item {
  text-align: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.25rem;
}

.stat-label {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.profile-sections {
  display: grid;
  gap: 2rem;
}

.section {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
}

.section h3 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
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
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.info-item label {
  font-weight: 600;
  color: var(--text-primary);
}

.info-item span {
  color: var(--text-secondary);
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
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.preference-item label {
  display: block;
  font-weight: 600;
  color: var(--text-primary);
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
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.9rem;
}

.no-preferences {
  color: var(--text-muted);
  font-style: italic;
}

.rating-number {
  background: none !important;
  -webkit-background-clip: initial !important;
  -webkit-text-fill-color: initial !important;
  background-clip: initial !important;
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

  .profile-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
