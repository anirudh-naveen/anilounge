<!--
  StudioLinks.vue — animation-studio chips for a title (component).

  Used on movie, series, and expanded-episode views. Chips backed by a
  persisted studio open its detail screen; bare names render as plain tags.
-->
<template>
  <div
    v-if="links.length"
    class="studio-links"
    :class="{ compact: headingTag === 'h4' }"
    data-testid="studio-links"
  >
    <component :is="headingTag" class="studio-links-heading">{{ title }}</component>
    <div class="studio-chips">
      <button
        v-for="link in links"
        :key="`studio-${link.id || link.name}`"
        type="button"
        class="studio-chip"
        :class="{ clickable: Boolean(link.id) }"
        :disabled="!link.id"
        :data-testid="`studio-link-${link.id || link.name}`"
        @click.stop="openStudio(link)"
      >
        <i class="fas fa-building"></i>
        {{ link.name }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { UnifiedContent } from '@/types/content'
import { studioLinksForContent } from '@/utils/entities'

const props = withDefaults(
  defineProps<{
    content?: Pick<UnifiedContent, 'studios' | 'studioEntities' | 'productionCompanies'> | null
    title?: string
    headingTag?: 'h3' | 'h4'
  }>(),
  {
    content: null,
    title: 'Animation studios',
    headingTag: 'h3',
  },
)

const route = useRoute()
const router = useRouter()

const links = computed(() => studioLinksForContent(props.content))

const openStudio = (link: { id: string }) => {
  if (!link.id) return
  router.push({
    name: 'StudioDetails',
    params: { id: link.id },
    query: { from: route.fullPath },
  })
}
</script>

<style scoped>
.studio-links {
  margin-bottom: 2rem;
}

.studio-links-heading {
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.studio-links.compact {
  margin: 1.25rem 0 0;
}

.compact .studio-links-heading {
  font-size: 1rem;
  margin-bottom: 0.75rem;
}

.studio-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.studio-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 0.3rem 0.8rem;
  border-radius: 20px;
  font-size: 0.9rem;
  font-family: inherit;
  border: 1px solid var(--border-color);
  cursor: default;
}

.studio-chip i {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.studio-chip.clickable {
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}

.studio-chip.clickable:hover {
  border-color: var(--coral-primary);
  background: var(--bg-hover);
}
</style>
