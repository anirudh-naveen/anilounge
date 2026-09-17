<!--
  BetaBanner.vue — site-wide beta notice (component).

  Displays a dismissible preview banner with a link to the feedback page.
-->
<template>
  <div v-if="showBanner" class="beta-banner">
    <!-- Title: Banner Content -->
    <div class="beta-content">
      <span class="beta-badge">BETA</span>
      <span class="beta-text">
        Welcome to AniLounge Beta! This is a preview version.
        <router-link to="/feedback" class="feedback-link">Report bugs or suggestions</router-link>
      </span>
      <button @click="dismissBanner" class="dismiss-btn" title="Dismiss">&times;</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const showBanner = ref(true)

const dismissBanner = () => {
  showBanner.value = false
  localStorage.setItem('beta-banner-dismissed', 'true')
}

onMounted(() => {
  // Check if user has previously dismissed the banner
  const dismissed = localStorage.getItem('beta-banner-dismissed')
  if (dismissed === 'true') {
    showBanner.value = false
  }
})
</script>

<style scoped>
.beta-banner {
  background: linear-gradient(90deg, #152238, #e07a5f 70%, #2bbbad);
  color: white;
  padding: 12px 0;
  position: relative;
  z-index: 100;
}

.beta-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.beta-badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.beta-text {
  flex: 1;
  font-size: 14px;
}

.feedback-link {
  color: var(--tan-light);
  text-decoration: underline;
  cursor: pointer;
  font-size: inherit;
  margin-left: 4px;
}

.feedback-link:hover {
  color: var(--tan-primary);
}

.dismiss-btn {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.dismiss-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

@media (max-width: 768px) {
  .beta-content {
    flex-direction: column;
    text-align: center;
    gap: 8px;
  }

  .beta-text {
    font-size: 13px;
  }
}
</style>
