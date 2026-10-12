<!--
  AppWelcome.vue — first screen of the iOS app for signed-out visitors (view).

  The app is built around your account (watchlist, friends, alerts, widgets), so it
  asks people to sign up or log in, and says why. The router sends every signed-out
  app visit here except sign-in, sign-up, and the privacy and support pages; browsers
  never see it. `?redirect=/path` is passed on so signing in returns to that page.
-->
<template>
  <div class="welcome-page">
    <section class="welcome-card fade-in">
      <img src="/anilounge-logo.png" alt="" class="welcome-logo" width="72" height="72" />
      <h1 class="welcome-title">Welcome to AniLounge</h1>
      <p class="welcome-lead">
        Track every animated movie and series you watch, and share them with friends.
      </p>

      <h2 class="welcome-why">Why you need an account</h2>
      <ul class="welcome-reasons">
        <li v-for="reason in REASONS" :key="reason.title">
          <strong>{{ reason.title }}</strong>
          <span>{{ reason.text }}</span>
        </li>
      </ul>

      <p class="welcome-note">
        It's free and there are no ads. We only ask for an email address, to verify your account and
        keep it secure, and you can delete your account at any time in Settings.
      </p>

      <div class="welcome-actions">
        <router-link
          :to="{ name: 'register', query: redirectQuery }"
          class="btn btn-primary"
          data-testid="welcome-signup"
        >
          Create a free account
        </router-link>
        <router-link
          :to="{ name: 'login', query: redirectQuery }"
          class="btn btn-secondary"
          data-testid="welcome-login"
        >
          Log in
        </router-link>
      </div>

      <p class="welcome-links">
        <router-link to="/privacy">Privacy policy</router-link>
        <router-link to="/support">Help &amp; support</router-link>
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { usePageTitle } from '@/composables/usePageMeta'

const REASONS = [
  {
    title: 'Your watchlist, everywhere',
    text: 'Episodes, ratings, and lists are saved to your account, and can sync with AniList, MyAnimeList, and TMDB.',
  },
  {
    title: 'Friends and the forum',
    text: 'See what friends are watching, message them, and join discussions under your own name.',
  },
  {
    title: 'Alerts and widgets for you',
    text: 'New-episode notifications, home screen widgets, and recommendations come from your own list.',
  },
]

const route = useRoute()

/** Pass the page they were opening on to sign-up and log-in. */
const redirectQuery = computed(() =>
  typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : {},
)

usePageTitle('Welcome')

defineOptions({
  name: 'AppWelcomePage',
})
</script>

<style scoped>
.welcome-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem calc(2rem + var(--safe-bottom));
}

.welcome-card {
  width: 100%;
  max-width: 460px;
  text-align: center;
}

.welcome-logo {
  display: block;
  margin: 0 auto 1.25rem;
  border-radius: 18px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
}

.welcome-title {
  margin: 0 0 0.5rem;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 1.9rem;
}

.welcome-lead {
  margin: 0 0 1.75rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.welcome-why {
  margin: 0 0 0.75rem;
  color: var(--coral-primary);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.welcome-reasons {
  margin: 0 0 1.25rem;
  padding: 0;
  list-style: none;
  text-align: left;
}

.welcome-reasons li {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
}

.welcome-reasons li + li {
  margin-top: 0.6rem;
}

.welcome-reasons strong {
  color: var(--text-primary);
}

.welcome-reasons span {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.45;
}

.welcome-note {
  margin: 0 0 1.5rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.welcome-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.welcome-actions .btn {
  justify-content: center;
  width: 100%;
}

.welcome-links {
  display: flex;
  justify-content: center;
  gap: 1.25rem;
  margin: 1.5rem 0 0;
  font-size: 0.85rem;
}

.welcome-links a {
  color: var(--text-secondary);
}
</style>
