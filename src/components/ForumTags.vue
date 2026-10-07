<!--
  ForumTags.vue — a post's tags as a hierarchy (component).

  Franchise › movies/series/specials (episodes after their series) › characters,
  each chip linking to the forum filtered by it. `showKind` adds the kind label
  to every chip (post page).
-->
<template>
  <ol v-if="levels.length" class="forum-tags" data-testid="forum-tags">
    <li v-for="(level, index) in levels" :key="index" class="forum-tag-level">
      <span v-if="index > 0" class="forum-tag-sep" aria-hidden="true">›</span>
      <router-link
        v-for="tag in level"
        :key="`${tag.contentId}-${tag.season}-${tag.episode}`"
        :to="forumTagRoute(tag)"
        class="forum-tag"
        :class="tag.kind"
        :title="KIND_LABELS[tag.kind]"
      >
        <span v-if="showKind" class="forum-tag-kind">{{ KIND_LABELS[tag.kind] }}</span>
        {{ tagLabel(tag) }}
      </router-link>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PostTag } from '@/types/forum'
import { forumTagRoute, KIND_LABELS, tagLabel, tagLevels } from '@/utils/forum'

const props = defineProps<{ tags: PostTag[]; showKind?: boolean }>()

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
}

.forum-tag-level {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.forum-tag-sep {
  color: var(--text-muted);
  font-weight: 700;
}

.forum-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-decoration: none;
}

.forum-tag:hover {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.forum-tag.franchise {
  font-weight: 700;
  color: var(--text-primary);
}

.forum-tag-kind {
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
