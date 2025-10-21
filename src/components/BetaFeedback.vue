<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="beta-feedback">
    <button @click="showModal = true" class="feedback-trigger" title="Send Feedback">💬</button>

    <transition name="modal">
      <div v-if="showModal" class="modal-overlay" @click="closeModal">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h2>Beta Feedback</h2>
            <button @click="closeModal" class="close-btn">&times;</button>
          </div>

          <form @submit.prevent="submitFeedback" class="feedback-form">
            <div class="form-group">
              <label for="feedbackType">Feedback Type</label>
              <select id="feedbackType" v-model="form.type" required class="form-control">
                <option value="bug">Bug Report</option>
                <option value="feature">Feature Request</option>
                <option value="improvement">Improvement</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="form-group">
              <label for="message">Message</label>
              <textarea
                id="message"
                v-model="form.message"
                required
                rows="6"
                class="form-control"
                placeholder="Tell us what you think..."
              ></textarea>
            </div>

            <div class="form-group">
              <label for="email">Email (optional)</label>
              <input
                id="email"
                v-model="form.email"
                type="email"
                class="form-control"
                placeholder="your@email.com"
              />
            </div>

            <button type="submit" class="btn-submit" :disabled="isSubmitting">
              {{ isSubmitting ? 'Sending...' : 'Send Feedback' }}
            </button>
          </form>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'vue-toastification'

const toast = useToast()
const showModal = ref(false)
const isSubmitting = ref(false)

const form = ref({
  type: 'bug',
  message: '',
  email: '',
})

const closeModal = () => {
  showModal.value = false
}

const submitFeedback = async () => {
  try {
    isSubmitting.value = true

    // Send feedback to backend
    const API_BASE_URL =
      import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001/api' : '/api')

    await fetch(`${API_BASE_URL}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(form.value),
    })

    toast.success('Thank you for your feedback! 🙏')

    // Reset form
    form.value = {
      type: 'bug',
      message: '',
      email: '',
    }
    closeModal()
  } catch {
    toast.error('Failed to send feedback. Please try again.')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.beta-feedback {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  z-index: 999;
}

.feedback-trigger {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.feedback-trigger:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.4);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 50px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.5rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.3s ease;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary);
}

.feedback-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.9rem;
}

.form-control {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.form-control:focus {
  outline: none;
  border-color: var(--coral-primary);
}

textarea.form-control {
  resize: vertical;
  min-height: 120px;
}

.btn-submit {
  padding: 1rem;
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-submit:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(255, 107, 107, 0.4);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .beta-feedback {
    bottom: 1rem;
    right: 1rem;
  }

  .feedback-trigger {
    width: 50px;
    height: 50px;
    font-size: 1.2rem;
  }

  .modal-content {
    padding: 1.5rem;
  }
}
</style>
