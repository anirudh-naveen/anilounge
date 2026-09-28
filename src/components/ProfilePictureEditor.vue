<!--
  ProfilePictureEditor.vue — profile picture upload/crop/remove (component).

  Used in the profile Customize panel. Picks an image, crops it square in a
  modal, and uploads it through the auth store; changes apply immediately.
  The shared demo account's picture is read-only.
-->
<template>
  <div class="picture-editor">
    <!-- Title: Preview -->
    <div class="current-picture">
      <img
        v-if="authStore.user?.profilePicture"
        :src="getProfilePictureUrl(authStore.user.profilePicture)"
        alt="Profile Picture"
        class="profile-picture-preview"
      />
      <div v-else class="profile-picture-placeholder">{{ initials }}</div>
    </div>

    <!-- Title: Controls -->
    <p v-if="authStore.isDemoUser" class="picture-note" data-testid="picture-demo-note">
      The demo account's picture can't be changed.
    </p>
    <div v-else class="upload-controls">
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style="display: none"
        data-testid="picture-input"
        @change="handleFileSelect"
      />
      <button type="button" class="btn btn-secondary" @click="fileInput?.click()">
        {{ authStore.user?.profilePicture ? 'Change picture' : 'Upload picture' }}
      </button>
      <button
        v-if="authStore.user?.profilePicture"
        type="button"
        class="btn btn-danger"
        :disabled="isBusy"
        @click="removeProfilePicture"
      >
        Remove
      </button>
    </div>

    <!-- Title: Image Crop -->
    <Teleport to="body">
      <div v-if="showCropModal" class="crop-modal-overlay" @click="closeCropModal">
        <div class="crop-modal" @click.stop>
          <div class="crop-modal-header">
            <h3>Crop Profile Picture</h3>
            <button type="button" class="close-btn" @click="closeCropModal">&times;</button>
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
              :min-container-width="200"
              :min-container-height="200"
            />
          </div>
          <div class="crop-controls">
            <button type="button" class="btn btn-secondary" @click="closeCropModal">Cancel</button>
            <button type="button" class="btn btn-primary" :disabled="isBusy" @click="cropAndUpload">
              {{ isBusy ? 'Uploading...' : 'Apply Crop' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from 'vue-toastification'
import VueCropper from 'vue-cropperjs'
import 'vue-cropperjs/node_modules/cropperjs/dist/cropper.css'
import { API_HOST } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits<{ changed: [profilePicture: string | null] }>()

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

const authStore = useAuthStore()
const toast = useToast()

const fileInput = ref<HTMLInputElement>()
const showCropModal = ref(false)
const cropImageUrl = ref('')
const selectedFile = ref<File | null>(null)
const isBusy = ref(false)
const cropper = ref<{
  getCroppedCanvas: (options?: {
    width?: number
    height?: number
    imageSmoothingEnabled?: boolean
    imageSmoothingQuality?: string
  }) => HTMLCanvasElement | null
} | null>(null)

const initials = computed(() => (authStore.user?.username || '').slice(0, 2).toUpperCase())

const getProfilePictureUrl = (profilePicture: string) =>
  profilePicture.startsWith('http') ? profilePicture : `${API_HOST}${profilePicture}`

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  if (!ALLOWED_TYPES.includes(file.type)) {
    toast.error('Please choose a JPG, PNG, GIF, or WebP image')
    return
  }
  if (file.size > MAX_BYTES) {
    toast.error('File size must be less than 5MB')
    return
  }
  selectedFile.value = file
  cropImageUrl.value = URL.createObjectURL(file)
  showCropModal.value = true
}

const closeCropModal = () => {
  showCropModal.value = false
  if (cropImageUrl.value) URL.revokeObjectURL(cropImageUrl.value)
  cropImageUrl.value = ''
  selectedFile.value = null
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))

const cropAndUpload = async () => {
  if (!selectedFile.value || !cropper.value) return
  isBusy.value = true
  try {
    const canvas = cropper.value.getCroppedCanvas({
      width: 300,
      height: 300,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    })
    const blob = canvas ? await toBlob(canvas) : null
    if (!blob) {
      toast.error('Failed to process cropped image')
      return
    }
    const formData = new FormData()
    formData.append(
      'profilePicture',
      new File([blob], selectedFile.value.name.replace(/\.[^.]+$/, '') + '.jpg', {
        type: 'image/jpeg',
      }),
    )
    await authStore.uploadProfilePicture(formData)
    emit('changed', authStore.user?.profilePicture ?? null)
    toast.success('Profile picture updated')
    closeCropModal()
  } catch {
    toast.error(authStore.error || 'Failed to upload profile picture')
  } finally {
    isBusy.value = false
  }
}

const removeProfilePicture = async () => {
  isBusy.value = true
  try {
    await authStore.removeProfilePicture()
    emit('changed', null)
    toast.success('Profile picture removed')
  } catch {
    toast.error(authStore.error || 'Failed to remove profile picture')
  } finally {
    isBusy.value = false
  }
}
</script>

<style scoped>
.picture-editor {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.current-picture {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--blend-color);
}

.profile-picture-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-picture-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--blend-color);
  color: white;
  font-size: 1.5rem;
  font-weight: 700;
}

.upload-controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.picture-note {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.crop-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
}

.crop-modal {
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  padding: 2rem;
  border-radius: 12px;
  background: var(--bg-card);
}

.crop-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.crop-modal-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.close-btn {
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-primary);
  font-size: 2rem;
  cursor: pointer;
}

.close-btn:hover {
  background: var(--bg-hover);
}

.crop-container {
  max-height: 400px;
  margin-bottom: 1.5rem;
  overflow: hidden;
  border-radius: 8px;
}

.crop-container img {
  display: block;
  max-width: 100%;
  max-height: 400px;
}

.crop-controls {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}
</style>
