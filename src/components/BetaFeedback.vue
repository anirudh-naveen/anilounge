<template>
  <div v-if="showFeedback" class="beta-feedback-overlay">
    <div class="beta-feedback-modal">
      <div class="beta-header">
        <h3>🎯 Beta Feedback</h3>
        <button @click="closeFeedback" class="close-btn">&times;</button>
      </div>

      <div class="beta-notice">
        <p><strong>Welcome to Find Animation Beta!</strong></p>
        <p>This is a beta version. Please report any bugs or suggestions to help us improve.</p>
      </div>

      <form @submit.prevent="submitFeedback" class="feedback-form">
        <div class="form-group">
          <label for="feedback-type">Feedback Type:</label>
          <select id="feedback-type" v-model="feedback.type" required>
            <option value="">Select type...</option>
            <option value="bug">🐛 Bug Report</option>
            <option value="feature">💡 Feature Request</option>
            <option value="improvement">✨ Improvement</option>
            <option value="other">💬 Other</option>
          </select>
        </div>

        <div class="form-group">
          <label for="feedback-message">Message:</label>
          <textarea
            id="feedback-message"
            v-model="feedback.message"
            placeholder="Describe your feedback..."
            rows="4"
            required
          ></textarea>
        </div>

        <div class="form-group">
          <label for="feedback-email">Email (optional):</label>
          <input
            id="feedback-email"
            v-model="feedback.email"
            type="email"
            placeholder="your@email.com"
          />
        </div>

        <div class="form-actions">
          <button type="button" @click="closeFeedback" class="btn-secondary">Cancel</button>
          <button type="submit" :disabled="submitting" class="btn-primary">
            {{ submitting ? 'Sending...' : 'Send Feedback' }}
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Beta Feedback Button -->
  <button
    v-if="!showFeedback"
    @click="showFeedback = true"
    class="beta-feedback-btn"
    title="Send Beta Feedback"
  >
    💬 Beta Feedback
  </button>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useToast } from 'vue-toastification'

const toast = useToast()

const showFeedback = ref(false)
const submitting = ref(false)

const feedback = reactive({
  type: '',
  message: '',
  email: '',
})

const closeFeedback = () => {
  showFeedback.value = false
  // Reset form
  feedback.type = ''
  feedback.message = ''
  feedback.email = ''
}

const submitFeedback = async () => {
  submitting.value = true

  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(feedback),
    })

    const result = await response.json()

    if (result.success) {
      toast.success(result.message)
      closeFeedback()
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('Failed to submit feedback:', error)
    toast.error('Failed to send feedback. Please try again.')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.beta-feedback-overlay {
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

.beta-feedback-modal {
  background: white;
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.beta-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.beta-header h3 {
  margin: 0;
  color: #1f2937;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #374151;
}

.beta-notice {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.beta-notice p {
  margin: 0 0 8px 0;
  color: #92400e;
}

.beta-notice p:last-child {
  margin-bottom: 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #374151;
}

.form-group select,
.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-group select:focus,
.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-group textarea {
  resize: vertical;
  min-height: 100px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
}

.btn-primary,
.btn-secondary {
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.btn-secondary {
  background: white;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover {
  background: #f9fafb;
}

.beta-feedback-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 50px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  transition: all 0.2s;
  z-index: 999;
}

.beta-feedback-btn:hover {
  background: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}
</style>
