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
          <h2>Profile Picture</h2>
          <div class="settings-card">
            <div class="setting-item">
              <div class="setting-info">
                <h3>Profile Picture</h3>
                <p>Upload a profile picture to personalize your account</p>
              </div>
              <div class="setting-control">
                <div class="profile-picture-section">
                  <div class="current-picture">
                    <img
                      v-if="authStore.user?.profilePicture"
                      :src="getProfilePictureUrl(authStore.user.profilePicture)"
                      alt="Profile Picture"
                      class="profile-picture-preview"
                    />
                    <div v-else class="profile-picture-placeholder">
                      <i class="fas fa-user"></i>
                    </div>
                  </div>
                  <div class="upload-controls">
                    <input
                      ref="fileInput"
                      type="file"
                      accept="image/*"
                      @change="handleFileSelect"
                      style="display: none"
                    />
                    <button @click="fileInput?.click()" class="btn btn-secondary">
                      <i class="fas fa-upload"></i>
                      Choose Picture
                    </button>
                    <button
                      v-if="authStore.user?.profilePicture"
                      @click="removeProfilePicture"
                      class="btn btn-danger"
                    >
                      <i class="fas fa-trash"></i>
                      Remove
                    </button>
                  </div>
                </div>
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

    <!-- Image Cropping Modal -->
    <div v-if="showCropModal" class="crop-modal-overlay" @click="closeCropModal">
      <div class="crop-modal" @click.stop>
        <div class="crop-modal-header">
          <h3>Crop Profile Picture</h3>
          <button @click="closeCropModal" class="close-btn">&times;</button>
        </div>
        <div class="crop-container">
          <vue-cropper
            ref="cropper"
            :src="cropImageUrl"
            :aspect-ratio="1"
            :view-mode="1"
            :drag-mode="'move'"
            :auto-crop-area="0.8"
            :background="false"
            :responsive="true"
            :restore="false"
            :check-cross-origin="false"
            :check-orientation="false"
            :modal="true"
            :guides="true"
            :center="true"
            :highlight="true"
            :crop-box-movable="true"
            :crop-box-resizable="true"
            :toggle-drag-mode-on-dblclick="false"
            :size="1"
            :min-container-width="200"
            :min-container-height="200"
            :min-canvas-width="0"
            :min-canvas-height="0"
            :min-crop-box-width="0"
            :min-crop-box-height="0"
            :ready="onCropperReady"
            :cropstart="onCropStart"
            :cropmove="onCropMove"
            :cropend="onCropEnd"
            :crop="onCrop"
            :zoom="onZoom"
          />
        </div>
        <div class="crop-controls">
          <button @click="closeCropModal" class="btn btn-secondary">Cancel</button>
          <button @click="cropAndUpload" class="btn btn-primary">Apply Crop</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'
import VueCropper from 'vue-cropperjs'
import 'vue-cropperjs/node_modules/cropperjs/dist/cropper.css'

// Component name for Vue devtools
defineOptions({
  name: 'SettingsPage',
})

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
const fileInput = ref<HTMLInputElement>()

// Image cropping
const showCropModal = ref(false)
const cropImageUrl = ref('')
const cropper = ref<{
  getCroppedCanvas: (options?: {
    width?: number
    height?: number
    imageSmoothingEnabled?: boolean
    imageSmoothingQuality?: string
  }) => HTMLCanvasElement | null
} | null>(null)
const selectedFile = ref<File | null>(null)

// Available genres
const availableGenres = [
  'Action',
  'Adventure',
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
  'Biography',
  'Film Noir',
  'Musical',
  'Sport',
  'Superhero',
  'Supernatural',
  'Psychological',
  'Slice of Life',
  'Mecha',
  'School',
  'Ecchi',
  'Harem',
  'Josei',
  'Seinen',
  'Shoujo',
  'Shounen',
  'Isekai',
  'Martial Arts',
  'Military',
  'Police',
  'Samurai',
  'Space',
  'Vampire',
  'Zombie',
]

// Computed properties
const hasGenreChanges = computed(() => {
  const currentGenres = authStore.user?.preferences?.favoriteGenres || []
  return (
    JSON.stringify([...selectedGenres.value].sort()) !== JSON.stringify([...currentGenres].sort())
  )
})

const hasStudioChanges = computed(() => {
  const currentStudios = authStore.user?.preferences?.favoriteStudios || []
  return (
    JSON.stringify([...selectedStudios.value].sort()) !== JSON.stringify([...currentStudios].sort())
  )
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
  } catch {
    toast.error('Failed to update username')
  }
}

const updateEmail = async () => {
  try {
    await authStore.updateProfile({ email: email.value })
    toast.success('Email updated successfully')
  } catch {
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
  } catch {
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
  } catch {
    toast.error('Failed to update favorite studios')
  }
}

const changePassword = async () => {
  try {
    await authStore.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    toast.success('Password changed successfully')
    // Clear password fields
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch {
    toast.error('Failed to change password')
  }
}

const getProfilePictureUrl = (profilePicture: string) => {
  if (!profilePicture) return ''
  if (profilePicture.startsWith('http')) {
    return profilePicture
  }
  return `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${profilePicture}`
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // Validate file type
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ]

  if (!allowedTypes.includes(file.type)) {
    toast.error('Please select a valid image file (JPG, PNG, GIF, WebP, or SVG)')
    return
  }

  // Validate file size (5MB limit)
  if (file.size > 5 * 1024 * 1024) {
    toast.error('File size must be less than 5MB')
    return
  }

  // Open crop modal
  openCropModal(file)
}

const removeProfilePicture = async () => {
  try {
    await authStore.updateProfile({ profilePicture: null })
    toast.success('Profile picture removed successfully')
  } catch {
    toast.error('Failed to remove profile picture')
  }
}

const openCropModal = (file: File) => {
  selectedFile.value = file
  cropImageUrl.value = URL.createObjectURL(file)
  showCropModal.value = true
}

const closeCropModal = () => {
  showCropModal.value = false
  if (cropImageUrl.value) {
    URL.revokeObjectURL(cropImageUrl.value)
    cropImageUrl.value = ''
  }
  selectedFile.value = null
}

const cropAndUpload = async () => {
  if (!selectedFile.value || !cropper.value) return

  try {
    // Get cropped canvas
    const canvas = cropper.value.getCroppedCanvas({
      width: 300,
      height: 300,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    })

    if (!canvas) {
      toast.error('Failed to crop image')
      return
    }

    // Convert canvas to blob
    canvas.toBlob(
      async (blob: Blob | null) => {
        if (!blob) {
          toast.error('Failed to process cropped image')
          return
        }

        // Create new file from blob
        const croppedFile = new File([blob], selectedFile.value!.name, {
          type: blob.type,
          lastModified: Date.now(),
        })

        // Upload the cropped file
        const formData = new FormData()
        formData.append('profilePicture', croppedFile)

        await authStore.uploadProfilePicture(formData)
        toast.success('Profile picture uploaded successfully')
        closeCropModal()
      },
      'image/jpeg',
      0.9,
    )
  } catch {
    toast.error('Failed to upload profile picture')
  }
}

// Cropper event handlers
const onCropperReady = () => {
  // Cropper is ready
}

const onCropStart = () => {
  // Crop started
}

const onCropMove = () => {
  // Crop moved
}

const onCropEnd = () => {
  // Crop ended
}

const onCrop = () => {
  // Crop completed
}

const onZoom = () => {
  // Zoom changed
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
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.page-header p {
  font-size: 1.1rem;
  color: var(--text-secondary);
}

.settings-content {
  display: grid;
  gap: 2rem;
}

.settings-section h2 {
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.settings-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
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
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.setting-info p {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.setting-control {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-input {
  padding: 0.75rem;
  border: 2px solid var(--text-muted);
  border-radius: 8px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  backdrop-filter: blur(10px);
}

.form-input:focus {
  outline: none;
  border-color: var(--blend-color);
  box-shadow: 0 0 0 3px rgba(179, 153, 154, 0.2);
  background: rgba(255, 255, 255, 0.2);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-primary {
  background: var(--blend-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--coral-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.btn-primary:disabled {
  background: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.6;
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
  padding: 0.75rem 1rem;
  border: 2px solid var(--text-muted);
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  font-weight: 500;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
}

.genre-option:hover {
  border-color: var(--blend-color);
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.genre-option.selected {
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  color: white;
  border-color: var(--blend-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transform: translateY(-2px);
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
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  padding: 0.5rem 0.75rem;
  border-radius: 20px;
  color: white;
  font-size: 0.9rem;
  font-weight: 500;
}

.remove-btn {
  background: rgba(255, 255, 255, 0.2);
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
  transition: all 0.2s;
}

.remove-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
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

/* Profile Picture Styles */
.profile-picture-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.current-picture {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--blend-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-picture-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-picture-placeholder {
  width: 100%;
  height: 100%;
  background: var(--blend-color);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
}

.upload-controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.upload-controls .btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 140px;
  text-align: center;
  white-space: nowrap;
}

.btn-secondary {
  background: var(--teal-primary);
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--teal-light);
}

.btn-danger {
  background: #e74c3c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #c0392b;
}

@media (max-width: 768px) {
  .upload-controls {
    flex-direction: column;
    width: 100%;
  }

  .upload-controls .btn {
    width: 100%;
  }
}

/* Image Cropping Modal Styles */
.crop-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.crop-modal {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 2rem;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  backdrop-filter: blur(10px);
}

.crop-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.crop-modal-header h3 {
  color: var(--text-primary);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 2rem;
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.crop-container {
  margin-bottom: 1.5rem;
  max-height: 400px;
  overflow: hidden;
  border-radius: 8px;
}

.crop-container img {
  max-width: 100%;
  max-height: 400px;
  display: block;
}

.crop-controls {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}
</style>
