<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Forum.vue — locked community placeholder.

  Forum discussions are planned but not yet available. This route exists so
  the nav tab can sit beside Home without exposing unfinished features.
-->
<template>
  <div class="forum-page">
    <div class="container">
      <section class="forum-lock fade-in">
        <div class="lock-mark" aria-hidden="true">
          <img src="/anilounge-logo.png" alt="" class="lock-logo" width="88" height="88" />
          <span class="lock-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path stroke-linecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
        </div>
        <p class="kicker">Coming soon</p>
        <h1 class="forum-title">The Forums</h1>
        <p class="forum-copy">
          Reviews, episode threads, and franchise talk is coming soon. Stay tuned.
        </p>
        <router-link to="/" class="btn btn-primary">Back to Home</router-link>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'ForumPage',
})
</script>

<style scoped>
.forum-page {
  min-height: calc(100vh - 160px);
  display: flex;
  align-items: center;
  padding: 3rem 0 5rem;
}

.container {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 1.25rem;
}

.forum-lock {
  text-align: center;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 3.5rem 2rem;
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(16px);
}

.lock-mark {
  position: relative;
  width: 88px;
  height: 88px;
  margin: 0 auto 1.5rem;
}

.lock-logo {
  width: 88px;
  height: 88px;
  border-radius: 22px;
  display: block;
  box-shadow: var(--shadow-glow);
}

.lock-badge {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--navbar-primary);
  border: 2px solid var(--coral-primary);
  color: var(--tan-light);
  display: flex;
  align-items: center;
  justify-content: center;
}

.lock-badge svg {
  width: 16px;
  height: 16px;
}

.kicker {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--coral-light);
  margin-bottom: 0.6rem;
}

.forum-title {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 650;
  letter-spacing: -0.03em;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.forum-copy {
  color: var(--text-secondary);
  font-size: 1.05rem;
  line-height: 1.7;
  max-width: 34rem;
  margin: 0 auto 2rem;
}

@media (max-width: 640px) {
  .forum-lock {
    padding: 2.5rem 1.25rem;
  }

  .forum-title {
    font-size: 2.25rem;
  }
}
</style>
