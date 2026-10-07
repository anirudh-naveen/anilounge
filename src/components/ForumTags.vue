<!--
  ForumTags.vue — a post's tags as a hierarchy (component).

  Franchise › movies/series/specials (episodes after their series) › characters,
  each chip linking to the forum filtered by it. Chips stay on one line and
  truncate long names (the full name is the tooltip). `showKind` adds the kind
  label to every chip (post page); `compact` uses smaller chips (cards).
-->
<template>
  <ol v-if="levels.length" class="forum-tags" :class="{ compact }" data-testid="forum-tags">
    <li v-for="(level, index) in levels" :key="index" class="forum-tag-level">
      <span v-if="index > 0" class="forum-tag-sep" aria-hidden="true">›</span>
      <router-link
        v-for="tag in level"
        :key="`${tag.contentId}-${tag.season}-${tag.episode}`"
        :to="forumTagRoute(tag)"
        class="forum-tag"
        :class="tag.kind"
        :title="`${KIND_LABELS[tag.kind]}: ${tagLabel(tag)}`"
      >
        <span v-if="showKind" class="forum-tag-kind">{{ KIND_LABELS[tag.kind] }}</span>
        <span class="forum-tag-name">{{ tagLabel(tag) }}</span>
      </router-link>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PostTag } from '@/types/forum'
import { forumTagRoute, KIND_LABELS, tagLabel, tagLevels } from '@/utils/forum'

const props = defineProps<{ tags: PostTag[]; showKind?: boolean; compact?: boolean }>()

const levels = computed(() => tagLevels(props.tags))
</script>

<style scoped>
.forum-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  list-style: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.forum-tag-level {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  max-width: 100%;
}

.forum-tag-sep {
  font-size: 0.85em;
  color: var(--text-muted);
}

.forum-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 100%;
  min-width: 0;
  height: 1.6rem;
  padding: 0 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--text-primary) 5%, transparent);
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.forum-tag:hover {
  border-color: var(--border-hover);
  background: color-mix(in srgb, var(--text-primary) 9%, transparent);
  color: var(--text-primary);
}

.forum-tag-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Franchises and titles lead the hierarchy; characters sit quieter. */
.forum-tag:not(.character) {
  color: var(--text-primary);
  font-weight: 600;
}

.forum-tag-kind {
  flex-shrink: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.compact .forum-tag {
  height: 1.35rem;
  padding: 0 0.45rem;
  font-size: 0.74rem;
}
</style>
