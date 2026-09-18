<!--
  BetaFeedback.vue — beta feedback form (component).

  Bug reports, feature requests, and other feedback posted to the backend.
  Used on the dedicated Feedback page (linked from the beta banner).
-->
<template>
  <form @submit.prevent="submitFeedback" class="feedback-form" data-testid="feedback-form">
    <div class="form-group">
      <label for="feedbackType">Feedback type</label>
      <select id="feedbackType" v-model="form.type" required class="form-control">
        <option value="bug">Bug report</option>
        <option value="feature">Feature request</option>
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
      {{ isSubmitting ? 'Sending...' : 'Send feedback' }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'vue-toastification'
import { API_BASE_URL } from '@/services/api'

const toast = useToast()
const isSubmitting = ref(false)

const form = ref({
  type: 'bug',
  message: '',
  email: '',
})

const submitFeedback = async () => {
  try {
    isSubmitting.value = true

    await fetch(`${API_BASE_URL}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(form.value),
    })

    toast.success('Thank you for your feedback!')
    form.value = {
      type: 'bug',
      message: '',
      email: '',
    }
  } catch {
    toast.error('Failed to send feedback. Please try again.')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
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

.form-control::placeholder {
  color: var(--text-muted);
}

.btn-submit {
  padding: 1rem;
  background: linear-gradient(135deg, var(--coral-primary), var(--teal-primary));
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
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
</style>
