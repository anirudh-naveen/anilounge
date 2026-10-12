<!--
  FranchiseLink.vue — the franchise pill on a title's header card (component).

  Links to the franchise page when the title has a franchise id; otherwise the
  name is plain text. Shows the franchise-wide rating when there is one.
-->
<template>
  <TitlePill
    v-if="content.franchise"
    label="Franchise"
    :name="content.franchise"
    :to="
      content.franchiseId ? { name: 'FranchiseDetails', params: { id: content.franchiseId } } : null
    "
    :rating="content.franchiseRating"
    rating-title="Average rating across the franchise"
    data-testid="franchise"
  />
</template>

<script setup lang="ts">
import TitlePill from '@/components/TitlePill.vue'
import type { UnifiedContent } from '@/types/content'

defineProps<{
  content: Pick<UnifiedContent, 'franchise' | 'franchiseId' | 'franchiseRating'>
}>()
</script>
