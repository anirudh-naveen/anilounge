<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Support.vue — how to get help with the website and the iOS app (the App Store's
  support URL), with answers to common account questions.
-->
<template>
  <div class="doc-page">
    <div class="container">
      <article class="doc-card fade-in">
        <p class="kicker">Help</p>
        <h1 class="doc-title">Support</h1>
        <p class="doc-date">For the AniLounge website and iOS app</p>

        <h2>Contact us</h2>
        <ul>
          <li>
            Email <a :href="`mailto:${SUPPORT_EMAIL}`">{{ SUPPORT_EMAIL }}</a> for account help,
            privacy requests, or anything else. We usually reply within a few days.
          </li>
          <li>
            Report a bug or suggest a feature with the
            <router-link to="/feedback">feedback form</router-link>.
          </li>
          <li>
            Chat with the team and other users on
            <a :href="DISCORD_INVITE_URL" target="_blank" rel="noopener noreferrer">Discord</a>.
          </li>
        </ul>

        <h2>Common questions</h2>

        <h3>I can't sign in</h3>
        <p>
          After several wrong passwords your account locks for a while; the email we send has a link
          to unlock it sooner. If you've forgotten your password, email us from the address on your
          account.
        </p>

        <h3>How do I delete my account?</h3>
        <p>
          Go to Settings, then Privacy &amp; Security, and choose Delete account. This removes your
          account along with your lists, posts, comments, and messages. It can't be undone.
        </p>

        <h3>How do I block or report someone?</h3>
        <p>
          Open their profile and choose Block. They stop being your friend, can't send you requests
          or messages, and you won't see their forum posts or comments. Unblock them any time in
          Settings. To report a forum post or comment, use Report on it, and we'll review it.
        </p>

        <h3>How do I bring over my list from another site?</h3>
        <p>
          Go to Connections to link AniList, MyAnimeList, or TMDB. You can import your list and keep
          it in sync, or import a MyAnimeList export file without connecting.
        </p>

        <h3>Do I need to update the app?</h3>
        <p>
          Most new features appear in the app automatically, without an App Store update. Keep the
          app updated anyway so you get fixes to the app itself.
        </p>

        <p class="doc-footnote">
          See our <router-link to="/privacy">privacy policy</router-link> for how we handle your
          data.
        </p>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DISCORD_INVITE_URL, SUPPORT_EMAIL } from '@/utils/community'
import { usePageMeta } from '@/composables/usePageMeta'

// Keep in step with STATIC_PAGES in backend/src/services/seoService.js.
usePageMeta({
  title: 'Support',
  description:
    'Get help with the AniLounge website and iOS app: contact options, bug reports, and answers to common account questions.',
  path: '/support',
})

defineOptions({
  name: 'SupportPage',
})
</script>

<style scoped src="@/assets/styles/docPage.css"></style>
