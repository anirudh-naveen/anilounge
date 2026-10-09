<!--
  SupportCard.vue — "Support AniLounge" donation card (component).

  Links to the Ko-fi page (`VITE_DONATE_URL`, opened in a new tab) and explains the
  Supporter badge: donating with the email on your account grants it automatically.
  Renders nothing when `VITE_DONATE_URL` is set to an empty string.
-->
<template>
  <section v-if="DONATE_URL" class="support-card" data-testid="support-card">
    <BadgeEmblem badge="supporter" size="xl" :tooltip="false" class="support-emblem" />
    <div class="support-body">
      <h2 class="support-title">Keep the lounge open</h2>
      <p class="support-text">
        AniLounge is free and ad-free. Donations pay for the servers.
        <template v-if="authStore.isAuthenticated">
          Donate with the email on your account and you'll get the
          <strong>Supporter</strong> badge.
        </template>
        <template v-else>
          Donate with the email you sign up with to get the <strong>Supporter</strong> badge.
        </template>
      </p>
    </div>
    <a
      :href="DONATE_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="btn btn-primary support-action"
      data-testid="support-donate"
      >Support on Ko-fi</a
    >
  </section>
</template>

<script setup lang="ts">
import BadgeEmblem from '@/components/BadgeEmblem.vue'
import { useAuthStore } from '@/stores/auth'
import { DONATE_URL } from '@/utils/donations'

const authStore = useAuthStore()
</script>

<style scoped>
.support-card {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background:
    radial-gradient(circle at 0 0, rgba(244, 123, 103, 0.14), transparent 55%), var(--bg-card);
  box-shadow: var(--shadow-md);
}

.support-body {
  flex: 1;
  min-width: 0;
}

.support-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.support-text {
  margin: 0.3rem 0 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

.support-action {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .support-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
}
</style>
