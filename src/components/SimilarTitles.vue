<!--
  SimilarTitles.vue — "Watchers Who Liked This Also Liked" on movie and series pages
  (component).

  A poster rail of titles AniList and TMDB users recommend to fans of this one, from
  GET /content/:id/similar (a season page passes its series). Sequels and other titles
  in the same franchise are left out. Renders nothing when there are no picks.
-->
<template>
  <DetailSection
    v-if="items.length"
    name="similar-titles"
    title="Watchers Who Liked This Also Liked"
    data-testid="similar-titles"
  >
    <template #aside>From AniList and TMDB community recommendations</template>
    <ContentRail
      rail-id="similar"
      title="Watchers Who Liked This Also Liked"
      hide-header
      :items="items"
      :is-authenticated="authStore.isAuthenticated"
      :in-watchlist="contentStore.isInWatchlist"
      @select="open"
    />
  </DetailSection>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ContentRail from '@/components/ContentRail.vue'
import DetailSection from '@/components/DetailSection.vue'
import { contentAPI, getDetailsRouteName } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { useContentStore } from '@/stores/content'
import type { UnifiedContent } from '@/types/content'

const props = defineProps<{ contentId: string }>()

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const contentStore = useContentStore()
const items = ref<UnifiedContent[]>([])

const load = async (contentId: string) => {
  items.value = []
  if (!contentId) return
  try {
    const response = await contentAPI.similar(contentId)
    if (contentId === props.contentId) items.value = response.data.data?.items || []
  } catch {
    // Optional section: leave it hidden.
  }
}

const open = (item: UnifiedContent) => {
  router.push({
    name: getDetailsRouteName(item),
    params: { id: item._id },
    query: { from: route.fullPath },
  })
}

watch(() => props.contentId, load, { immediate: true })
</script>

<style scoped>
.content-rail {
  margin-bottom: 0;
}
</style>
