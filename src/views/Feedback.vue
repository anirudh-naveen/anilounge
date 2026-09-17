<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Feedback.vue — beta bug/suggestion page.

  Public form for reports linked from the site-wide beta banner.
-->
<template>
  <div class="feedback-page">
    <div class="container">
      <section class="feedback-card fade-in">
        <p class="kicker">Beta</p>
        <h1 class="feedback-title">Report bugs or suggestions</h1>
        <p class="feedback-copy">
          Tell us about a bug, a missing feature, or anything else that would make AniLounge better.
        </p>
        <BetaFeedback />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import BetaFeedback from '@/components/BetaFeedback.vue'

defineOptions({
  name: 'FeedbackPage',
})
</script>

<style scoped>
.feedback-page {
  min-height: calc(100vh - 160px);
  display: flex;
  align-items: flex-start;
  padding: 3rem 0 5rem;
}

.container {
  max-width: 640px;
  margin: 0 auto;
  padding: 0 1.25rem;
  width: 100%;
}

.feedback-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 2.5rem 2rem;
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(16px);
}

.kicker {
  margin: 0 0 0.5rem;
  color: var(--coral-primary);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.feedback-title {
  margin: 0 0 0.75rem;
  color: var(--text-primary);
  font-size: 1.85rem;
}

.feedback-copy {
  margin: 0 0 1.75rem;
  color: var(--text-secondary);
  line-height: 1.5;
}
</style>
