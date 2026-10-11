<!-- eslint-disable vue/multi-word-component-names -->
<!--
  Privacy.vue — privacy policy for the website and the iOS app.

  Keep it in step with what the backend stores (db/schema.sql) and who it shares data
  with (TECHNOLOGY.md); update POLICY_DATE whenever the substance changes.
-->
<template>
  <div class="doc-page">
    <div class="container">
      <article class="doc-card fade-in">
        <p class="kicker">Legal</p>
        <h1 class="doc-title">Privacy policy</h1>
        <p class="doc-date">Last updated {{ POLICY_DATE }}</p>

        <p>
          This policy covers AniLounge at anilounge.net and the AniLounge iOS app. AniLounge is
          free, has no ads, and does not sell your data. Questions go to
          <a :href="`mailto:${SUPPORT_EMAIL}`">{{ SUPPORT_EMAIL }}</a
          >.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Your account:</strong> username, email address, password (stored only as a
            secure hash), and, if you turn it on, your two-factor sign-in secret.
          </li>
          <li>
            <strong>Your profile:</strong> profile picture, bio, favorite genres, and profile
            settings such as which tabs are visible.
          </li>
          <li>
            <strong>What you add:</strong> your watchlist, ratings, favorites, and watch history;
            forum posts, comments, likes, and reports; friend requests and friends; direct messages;
            and feedback you send us.
          </li>
          <li>
            <strong>Connected accounts:</strong> if you connect AniList, MyAnimeList, or TMDB, we
            keep the access tokens they give us (encrypted) so we can import and sync your list. You
            can disconnect at any time.
          </li>
          <li>
            <strong>Site usage:</strong> which pages are viewed and what is clicked, tied to a
            random ID kept on your device. No IP address or device details are stored with these,
            and they are deleted after 400 days.
          </li>
          <li>
            <strong>Security records:</strong> the IP address and browser or device type of sign-ins
            and suspicious requests, used to protect accounts and stop abuse.
          </li>
          <li>
            <strong>Moderation:</strong> when filtered language is caught in something you write, a
            short excerpt is kept so moderators can review it.
          </li>
        </ul>

        <h2>Cookies and device storage</h2>
        <p>
          We use one cookie, which keeps you signed in for up to 30 days. Your device also stores a
          few preferences, such as your theme and banners you've dismissed, and the random usage ID
          above. There are no advertising or third-party tracking cookies.
        </p>

        <h2>How we use it</h2>
        <ul>
          <li>To run AniLounge: your lists, profile, forum, friends, and messages.</li>
          <li>To sync your list with sites you connect.</li>
          <li>
            To email you sign-in codes, security notices, friend requests, and announcements. You
            can turn off the optional emails in Settings.
          </li>
          <li>To keep the community safe: reports, filters, mutes, and bans.</li>
          <li>To understand, in total, which features get used.</li>
        </ul>

        <h2>What others can see</h2>
        <p>
          Your username, profile picture, and forum posts and comments are public. Your profile is
          public unless you make it private in Customize, and you choose which of its tabs show.
          Direct messages are only visible to you and the friend you're talking to. Your email
          address is never shown.
        </p>

        <h2>Services we use</h2>
        <p>These companies process data for us, only to provide AniLounge:</p>
        <ul>
          <li><strong>Vercel</strong> hosts the website.</li>
          <li><strong>Railway</strong> hosts our servers and database.</li>
          <li><strong>Resend</strong> and <strong>Zoho Mail</strong> send and receive email.</li>
          <li>
            <strong>Google Gemini</strong> answers the chat assistant. It receives what you type
            and, if you're signed in, your watchlist titles and statuses and your favorite genres
            and studios, so it can make suggestions.
          </li>
          <li>
            <strong>AniList</strong>, <strong>MyAnimeList</strong>, and <strong>TMDB</strong>
            receive your list changes only if you connect them.
          </li>
          <li>
            <strong>Ko-fi</strong> handles donations on the website. When you donate, we receive the
            amount and your email address so we can give your account the Supporter badge.
          </li>
        </ul>

        <h2>How long we keep it</h2>
        <ul>
          <li>Your data stays until you delete your account.</li>
          <li>
            Accounts unused for a year are deleted. We email you several times first, and signing in
            stops it.
          </li>
          <li>Sign-ups that never verify their email are deleted after 3 days.</li>
          <li>Site usage records are deleted after 400 days.</li>
        </ul>

        <h2>Your choices</h2>
        <ul>
          <li>Edit your profile, email, and email preferences in Settings.</li>
          <li>
            Delete your account in Settings, under Privacy &amp; Security. This removes your account
            along with your lists, posts, comments, and messages.
          </li>
          <li>Block anyone from their profile; manage blocked users in Settings.</li>
          <li>
            Ask us for a copy of your data, or anything else about your privacy, at
            <a :href="`mailto:${SUPPORT_EMAIL}`">{{ SUPPORT_EMAIL }}</a
            >.
          </li>
        </ul>

        <h2>Security</h2>
        <p>
          Passwords are hashed, connected-account tokens are encrypted, connections use HTTPS, and
          you can turn on two-factor sign-in. No service is perfectly secure, so please use a
          password you don't use elsewhere.
        </p>

        <h2>Children</h2>
        <p>
          AniLounge isn't meant for children under 13, and we don't knowingly collect their data. If
          you believe a child has an account, contact us and we'll remove it.
        </p>

        <h2>Changes</h2>
        <p>
          If this policy changes, we'll update the date above. For significant changes, we'll also
          tell you on the site or by email.
        </p>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SUPPORT_EMAIL } from '@/utils/community'
import { usePageTitle } from '@/composables/usePageMeta'

const POLICY_DATE = 'October 10, 2026'

usePageTitle('Privacy policy')

defineOptions({
  name: 'PrivacyPage',
})
</script>

<style scoped src="@/assets/styles/docPage.css"></style>
