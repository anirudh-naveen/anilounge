<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div v-if="showDropdown" class="status-dropdown-overlay" @click="closeDropdown">
    <div class="status-dropdown" @click.stop>
      <div class="dropdown-header">
        <h3>Add to Watchlist</h3>
        <button @click="closeDropdown" class="close-btn">×</button>
      </div>

      <div class="dropdown-content">
        <div class="status-selection">
          <label>Status:</label>
          <select v-model="selectedStatus" class="status-select">
            <option value="plan_to_watch">Plan to Watch</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div class="rating-selection">
          <label>Rating (1-10):</label>
          <input
            v-model.number="selectedRating"
            type="number"
            min="1"
            max="10"
            class="rating-input"
            placeholder="Optional"
          />
        </div>

        <div class="episode-selection" v-if="contentType === 'tv'">
          <label>Episodes Watched:</label>
          <input
            v-model.number="selectedEpisodes"
            type="number"
            min="0"
            class="episode-input"
            placeholder="0"
          />
        </div>

        <div class="notes-selection">
          <label>Notes:</label>
          <textarea
            v-model="selectedNotes"
            class="notes-textarea"
            placeholder="Optional notes..."
            rows="3"
          ></textarea>
        </div>
      </div>

      <div class="dropdown-actions">
        <button @click="closeDropdown" class="btn btn-secondary">Cancel</button>
        <button @click="addToWatchlist" class="btn btn-primary">Add to Watchlist</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useContentStore } from '@/stores/content'
import { useAuthStore } from '@/stores/auth'
import { useToast } from 'vue-toastification'

interface Props {
  showDropdown: boolean
  contentId: string
  contentType: 'movie' | 'tv'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const contentStore = useContentStore()
const authStore = useAuthStore()
const toast = useToast()

const selectedStatus = ref<'plan_to_watch' | 'completed'>('plan_to_watch')
const selectedRating = ref<number | undefined>(undefined)
const selectedEpisodes = ref<number>(0)
const selectedNotes = ref<string>('')

const closeDropdown = () => {
  emit('close')
  resetForm()
}

const resetForm = () => {
  selectedStatus.value = 'plan_to_watch'
  selectedRating.value = undefined
  selectedEpisodes.value = 0
  selectedNotes.value = ''
}

const addToWatchlist = async () => {
  try {
    if (!authStore.isAuthenticated) {
      toast.error('Please login to add items to your watchlist')
      return
    }

    await contentStore.addToWatchlist(
      props.contentId,
      selectedStatus.value,
      selectedRating.value,
      props.contentType === 'tv' ? selectedEpisodes.value : undefined,
      selectedNotes.value || undefined,
    )

    toast.success('Added to watchlist!')
    closeDropdown()
  } catch (error) {
    console.error('Error adding to watchlist:', error)
    toast.error('Failed to add to watchlist')
  }
}
</script>

<style scoped>
.status-dropdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.status-dropdown {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 1.5rem;
  min-width: 400px;
  max-width: 500px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-color);
}

.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.dropdown-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.25rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dropdown-content {
  margin-bottom: 1.5rem;
}

.status-selection,
.rating-selection,
.episode-selection,
.notes-selection {
  margin-bottom: 1rem;
}

.status-selection label,
.rating-selection label,
.episode-selection label,
.notes-selection label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
  font-weight: 500;
}

.status-select,
.rating-input,
.episode-input,
.notes-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color 0.2s ease;
}

.status-select:focus,
.rating-input:focus,
.episode-input:focus,
.notes-textarea:focus {
  outline: none;
  border-color: var(--highlight-color);
}

.notes-textarea {
  resize: vertical;
  min-height: 80px;
}

.dropdown-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.9rem;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--highlight-color);
  color: white;
}

.btn-primary:hover {
  background: var(--highlight-hover);
}

@media (max-width: 768px) {
  .status-dropdown {
    min-width: 90vw;
    margin: 1rem;
  }

  .dropdown-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }
}
</style>
