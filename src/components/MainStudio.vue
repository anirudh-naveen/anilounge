<!--
  MainStudio.vue — the main studio pill on a title's header card (component).

  The main animation studio when the sources say which credits are animation
  studios; otherwise the first credit, labelled "Studio / Production" since it may
  be a production company. Opens the studio's page when it has one.
-->
<template>
  <TitlePill
    v-if="studio"
    :label="studio.label"
    :name="studio.link.name"
    :logo="studio.link.imagePath ? getPosterUrl(studio.link.imagePath) : ''"
    :to="studio.link.id ? detailPath('/studio', studio.link.id, studio.link.name) : null"
    data-testid="main-studio"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TitlePill from '@/components/TitlePill.vue'
import { getPosterUrl } from '@/services/api'
import type { UnifiedContent } from '@/types/content'
import { mainStudio } from '@/utils/entities'
import { detailPath } from '@/utils/slug'

const props = defineProps<{
  content: Pick<
    UnifiedContent,
    'studios' | 'studioEntities' | 'productionCompanies' | 'animationStudios'
  >
}>()

const studio = computed(() => mainStudio(props.content))
</script>
