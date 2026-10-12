<!--
  FranchiseLink.vue — the franchise pill on a title's header card (component).

  Links to the franchise page when the title has a franchise id; otherwise the
  name is plain text. Shows the franchise-wide rating when there is one.
-->
<template>
  <component
    :is="content.franchiseId ? RouterLink : 'span'"
    v-if="content.franchise"
    v-bind="
      content.franchiseId
        ? { to: { name: 'FranchiseDetails', params: { id: content.franchiseId } } }
        : {}
    "
    class="franchise-pill"
    :class="{ linked: Boolean(content.franchiseId) }"
    data-testid="franchise"
  >
    <span class="franchise-label">Franchise</span>
    <span class="franchise-name" data-testid="franchise-link">{{ content.franchise }}</span>
    <span
      v-if="content.franchiseRating"
      class="franchise-rating"
      title="Average rating across the franchise"
      data-testid="franchise-rating"
    >
      <ForumIcon name="star" filled class="franchise-star" />
      {{ content.franchiseRating.toFixed(1) }}
    </span>
  </component>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ForumIcon from '@/components/ForumIcon.vue'
import type { UnifiedContent } from '@/types/content'

defineProps<{
  content: Pick<UnifiedContent, 'franchise' | 'franchiseId' | 'franchiseRating'>
}>()
</script>

<style scoped>
.franchise-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  max-width: 100%;
  padding: 0.35rem 0.9rem 0.35rem 0.4rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.9rem;
  text-decoration: none;
  transition: border-color 0.2s ease;
}

.franchise-pill.linked:hover {
  border-color: var(--coral-primary);
}

.franchise-label {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.franchise-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.linked .franchise-name {
  color: var(--coral-primary);
}

.franchise-rating {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--text-muted);
}

.franchise-star {
  color: #f5c518;
}
</style>
