<!--
  ListSyncNote.vue — one-line "syncs with AniList & MyAnimeList" note (component).

  Shown under sign-up prompts that offer a watchlist, so visitors know they can
  bring their existing list and keep it in sync.
-->
<template>
  <p class="list-sync-note" data-testid="list-sync-note">
    <img src="/anilist-logo.svg" alt="" width="16" height="16" />
    <img src="/mal-logo.svg" alt="" width="16" height="16" />
    <span>Syncs with AniList &amp; MyAnimeList</span>
  </p>
</template>

<style scoped>
.list-sync-note {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.list-sync-note img {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.list-sync-note span {
  margin-left: 0.15rem;
}
</style>
