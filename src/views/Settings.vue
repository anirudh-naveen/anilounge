<template>
  <div class="settings-page">
    <div class="container">
      <div class="page-header">
        <h1>Settings</h1>
        <p>Customize your experience</p>
      </div>

      <div class="settings-content">
        <div class="settings-section">
          <h2>Account Settings</h2>
          <div class="settings-card">
            <div class="setting-item">
              <div class="setting-info">
                <h3>Username</h3>
                <p>Change your display name</p>
              </div>
              <div class="setting-control">
                <input
                  v-model="username"
                  type="text"
                  class="form-input"
                  placeholder="Enter new username"
                />
                <button
                  @click="updateUsername"
                  class="btn btn-primary"
                  :disabled="!username || username === authStore.user?.username"
                >
                  Update
                </button>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h3>Email</h3>
                <p>Change your email address</p>
              </div>
              <div class="setting-control">
                <input
                  v-model="email"
                  type="email"
                  class="form-input"
                  placeholder="Enter new email"
                />
                <button
                  @click="updateEmail"
                  class="btn btn-primary"
                  :disabled="!email || email === authStore.user?.email"
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2>Preferences</h2>
          <div class="settings-card">
            <div class="setting-item">
              <div class="setting-info">
                <h3>Favorite Genres</h3>
                <p>Select your preferred genres</p>
              </div>
              <div class="setting-control">
                <div class="genre-selection">
                  <div
                    v-for="genre in availableGenres"
                    :key="genre"
                    class="genre-option"
                    :class="{ selected: selectedGenres.includes(genre) }"
                    @click="toggleGenre(genre)"
                  >
                    {{ genre }}
                  </div>
                </div>
                <button @click="updateGenres" class="btn btn-primary" :disabled="!hasGenreChanges">
                  Save Genres
                </button>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h3>Favorite Studios</h3>
                <p>Add your favorite animation studios</p>
              </div>
              <div class="setting-control">
                <div class="studio-input">
                  <input
                    v-model="newStudio"
                    type="text"
                    class="form-input"
                    placeholder="Enter studio name"
                    @keyup.enter="addStudio"
                  />
                  <button @click="addStudio" class="btn btn-secondary">Add</button>
                </div>
                <div class="studio-list">
                  <div v-for="studio in selectedStudios" :key="studio" class="studio-item">
                    <span>{{ studio }}</span>
                    <button @click="removeStudio(studio)" class="remove-btn">×</button>
                  </div>
                </div>
                <button
                  @click="updateStudios"
                  class="btn btn-primary"
                  :disabled="!hasStudioChanges"
                >
                  Save Studios
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2>Privacy & Security</h2>
          <div class="settings-card">
            <div class="setting-item">
              <div class="setting-info">
                <h3>Change Password</h3>
                <p>Update your account password</p>
              </div>
              <div class="setting-control">
                <div class="password-form">
                  <input
                    v-model="currentPassword"
                    type="password"
                    class="form-input"
                    placeholder="Current password"
                  />
                  <input
                    v-model="newPassword"
                    type="password"
                    class="form-input"
                    placeholder="New password"
                  />
                  <input
                    v-model="confirmPassword"
                    type="password"
                    class="form-input"
                    placeholder="Confirm new password"
                  />
                  <button
                    @click="changePassword"
                    class="btn btn-primary"
                    :disabled="!canChangePassword"
                  >
                    Change Password
                  </button>
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
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'

const authStore = useAuthStore()
const toast = useToast()

// Form data
const username = ref('')
const email = ref('')
const selectedGenres = ref<string[]>([])
const selectedStudios = ref<string[]>([])
const newStudio = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

// Available genres
const availableGenres = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western',
]

// Computed properties
const hasGenreChanges = computed(() => {
  const currentGenres = authStore.user?.preferences?.favoriteGenres || []
  return JSON.stringify(selectedGenres.value.sort()) !== JSON.stringify(currentGenres.sort())
})

const hasStudioChanges = computed(() => {
  const currentStudios = authStore.user?.preferences?.favoriteStudios || []
  return JSON.stringify(selectedStudios.value.sort()) !== JSON.stringify(currentStudios.sort())
})

const canChangePassword = computed(() => {
  return (
    currentPassword.value &&
    newPassword.value &&
    confirmPassword.value &&
    newPassword.value === confirmPassword.value &&
    newPassword.value.length >= 6
  )
})

// Methods
const toggleGenre = (genre: string) => {
  const index = selectedGenres.value.indexOf(genre)
  if (index > -1) {
    selectedGenres.value.splice(index, 1)
  } else {
    selectedGenres.value.push(genre)
  }
}

const addStudio = () => {
  if (newStudio.value.trim() && !selectedStudios.value.includes(newStudio.value.trim())) {
    selectedStudios.value.push(newStudio.value.trim())
    newStudio.value = ''
  }
}

const removeStudio = (studio: string) => {
  const index = selectedStudios.value.indexOf(studio)
  if (index > -1) {
    selectedStudios.value.splice(index, 1)
  }
}

const updateUsername = async () => {
  try {
    await authStore.updateProfile({ username: username.value })
    toast.success('Username updated successfully')
  } catch (error) {
    toast.error('Failed to update username')
  }
}

const updateEmail = async () => {
  try {
    await authStore.updateProfile({ email: email.value })
    toast.success('Email updated successfully')
  } catch (error) {
    toast.error('Failed to update email')
  }
}

const updateGenres = async () => {
  try {
    await authStore.updateProfile({
      preferences: {
        favoriteGenres: selectedGenres.value,
        favoriteStudios: authStore.user?.preferences?.favoriteStudios || [],
      },
    })
    toast.success('Favorite genres updated successfully')
  } catch (error) {
    toast.error('Failed to update favorite genres')
  }
}

const updateStudios = async () => {
  try {
    await authStore.updateProfile({
      preferences: {
        favoriteGenres: authStore.user?.preferences?.favoriteGenres || [],
        favoriteStudios: selectedStudios.value,
      },
    })
    toast.success('Favorite studios updated successfully')
  } catch (error) {
    toast.error('Failed to update favorite studios')
  }
}

const changePassword = async () => {
  try {
    // This would need to be implemented in the backend
    toast.info('Password change feature coming soon')
  } catch (error) {
    toast.error('Failed to change password')
  }
}

// Initialize form data
onMounted(() => {
  username.value = authStore.user?.username || ''
  email.value = authStore.user?.email || ''
  selectedGenres.value = [...(authStore.user?.preferences?.favoriteGenres || [])]
  selectedStudios.value = [...(authStore.user?.preferences?.favoriteStudios || [])]
})
</script>

<style scoped>
.settings-page {
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

.settings-content {
  display: grid;
  gap: 2rem;
}

.settings-section h2 {
  font-size: 1.8rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 1rem;
}

.settings-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.setting-item {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  padding: 1.5rem 0;
  border-bottom: 1px solid #eee;
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info h3 {
  font-size: 1.2rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 0.5rem;
}

.setting-info p {
  color: #666;
  font-size: 0.9rem;
}

.setting-control {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-input {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
}

.form-input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #5a6fd8;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.genre-selection {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.genre-option {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.genre-option:hover {
  border-color: #667eea;
}

.genre-option.selected {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.studio-input {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.studio-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.studio-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #f8f9fa;
  padding: 0.5rem 0.75rem;
  border-radius: 20px;
}

.remove-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.8rem;
}

.password-form {
  display: grid;
  gap: 1rem;
}

@media (max-width: 768px) {
  .setting-item {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .genre-selection {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  }
}
</style>
