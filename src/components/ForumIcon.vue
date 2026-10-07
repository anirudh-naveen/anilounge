<!--
  ForumIcon.vue — line icons for forum actions (component).

  Same style as the site's nav and menu icons (24px grid, 1.75 stroke,
  currentColor). `filled` fills the heart for a liked state.
-->
<template>
  <svg
    class="forum-icon"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      v-if="name === 'heart'"
      d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10Z"
    />
    <template v-else-if="name === 'comment'">
      <path
        d="M5.5 16.5h.8l2.2 2.2V16.5H16A2.5 2.5 0 0 0 18.5 14V8A2.5 2.5 0 0 0 16 5.5H8A2.5 2.5 0 0 0 5.5 8v8.5Z"
      />
      <path d="M9 9.5h6M9 12.5h4" />
    </template>
    <template v-else-if="name === 'eye-off'">
      <path d="M3.5 12S6.5 6 12 6s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="m4.5 4.5 15 15" />
    </template>
  </svg>
</template>

<script setup lang="ts">
defineProps<{ name: 'heart' | 'comment' | 'eye-off'; filled?: boolean }>()
</script>

<style scoped>
.forum-icon {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  display: block;
}
</style>
