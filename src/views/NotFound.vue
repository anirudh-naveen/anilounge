<!--
  NotFound.vue — any URL the app has no page for. The site middleware (middleware.ts)
  serves these with a 404 status and `noindex`, so search engines drop them instead of
  indexing an empty page.
-->
<template>
  <div class="doc-page">
    <div class="container">
      <article class="doc-card fade-in">
        <p class="kicker">404</p>
        <h1 class="doc-title">Page not found</h1>
        <p>This page doesn't exist, or it has moved.</p>
        <ul>
          <li><router-link to="/">Home</router-link></li>
          <li><router-link to="/search">Search animated movies and series</router-link></li>
          <li><router-link to="/forum">Forum</router-link></li>
        </ul>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePageTitle } from '@/composables/usePageMeta'

usePageTitle('Page not found')

defineOptions({
  name: 'NotFoundPage',
})
</script>

<style scoped src="@/assets/styles/docPage.css"></style>
