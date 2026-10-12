<!--
  FranchiseLink.vue — "Franchise: <name>" line for a title's header card (component).

  Links to the franchise page when the title has a franchise id; otherwise the
  name is plain text. Shows the franchise-wide rating when there is one.
-->
<template>
  <p v-if="content.franchise" class="franchise-line" data-testid="franchise">
    <i class="fas fa-sitemap"></i>
    <span class="franchise-label">Franchise:</span>
    <router-link
      v-if="content.franchiseId"
      :to="{ name: 'FranchiseDetails', params: { id: content.franchiseId } }"
      class="franchise-link"
      data-testid="franchise-link"
      >{{ content.franchise }}</router-link
    >
    <span v-else class="franchise-name">{{ content.franchise }}</span>
    <span v-if="content.franchiseRating" class="franchise-rating" data-testid="franchise-rating">
      <i class="fas fa-star"></i> {{ content.franchiseRating.toFixed(1) }} across the franchise
    </span>
  </p>
</template>

<script setup lang="ts">
import type { UnifiedContent } from '@/types/content'

defineProps<{
  content: Pick<UnifiedContent, 'franchise' | 'franchiseId' | 'franchiseRating'>
}>()
</script>

<style scoped>
.franchise-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1rem;
}

.franchise-line > i {
  color: var(--highlight-color);
  width: 16px;
}

.franchise-label {
  color: var(--text-muted);
}

.franchise-link {
  color: var(--coral-primary);
  font-weight: 600;
  text-decoration: none;
}

.franchise-link:hover {
  text-decoration: underline;
}

.franchise-name {
  font-weight: 600;
}

.franchise-rating {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.franchise-rating i {
  color: #ffd700;
}
</style>
