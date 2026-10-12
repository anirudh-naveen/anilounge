<!--
  StudioLinks.vue — animation-studio chips for a title (component).

  Used on movie and series pages, each studio as its logo (or initial) and name.
  Studios backed by a persisted row open their detail screen; bare names render
  as plain tiles.
-->
<template>
  <DetailSection
    v-if="links.length"
    name="studios"
    :title="title"
    class="studio-links"
    data-testid="studio-links"
  >
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
        <span class="studio-logo">
          <img
            v-if="link.imagePath && !failedLogos.has(link.imagePath)"
            :src="getPosterUrl(link.imagePath)"
            :alt="''"
            loading="lazy"
            @error="failedLogos.add(link.imagePath)"
          />
          <span v-else class="studio-initial" aria-hidden="true">{{ link.name.charAt(0) }}</span>
        </span>
        <span class="studio-name">{{ link.name }}</span>
      </button>
    </div>
  </DetailSection>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { UnifiedContent } from '@/types/content'
import DetailSection from '@/components/DetailSection.vue'
import { getPosterUrl } from '@/services/api'
import { studioLinksForContent } from '@/utils/entities'

const props = withDefaults(
  defineProps<{
    content?: Pick<UnifiedContent, 'studios' | 'studioEntities' | 'productionCompanies'> | null
    title?: string
  }>(),
  {
    content: null,
    title: 'Animation Studios',
  },
)

const route = useRoute()
const router = useRouter()

const links = computed(() => studioLinksForContent(props.content))
/** Logos that failed to load; those studios show their initial instead. */
const failedLogos = reactive(new Set<string>())

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
.studio-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.studio-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  max-width: 100%;
  padding: 0.5rem 1rem 0.5rem 0.5rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  cursor: default;
}

.studio-chip:disabled {
  opacity: 1;
}

.studio-logo {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  padding: 6px;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.studio-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.studio-initial {
  color: #1a1a2e;
  font-size: 1.25rem;
  font-weight: 700;
}

.studio-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
