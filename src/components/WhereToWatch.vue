<!--
  WhereToWatch.vue — where a title can be watched (component).

  Direct links to the title on streaming sites (from AniList; in the iOS app they open
  the site's own app when installed), then the services that carry it in the viewer's
  country with a link to TMDB's full list (data by JustWatch, which must be credited).
  Renders nothing when there is nothing to show.
-->
<template>
  <section v-if="hasAnything" class="where-to-watch" data-testid="where-to-watch">
    <h2>Where to watch</h2>

    <div v-if="data?.streaming.length" class="watch-links">
      <a
        v-for="link in data.streaming"
        :key="link.site"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
        class="watch-link"
        data-open-with="app"
        :data-testid="`watch-link-${link.site}`"
        @click="openLink($event, link.url)"
      >
        {{ link.site }}
        <span v-if="link.language && link.language !== 'English'" class="watch-language">
          {{ link.language }}
        </span>
      </a>
    </div>

    <div v-if="providers.stream.length || providers.buy.length" class="watch-providers">
      <div v-for="group in providerGroups" :key="group.label" class="provider-group">
        <p class="provider-label">{{ group.label }}</p>
        <ul class="provider-list">
          <li v-for="provider in group.items" :key="provider.id" :title="provider.name">
            <img
              v-if="provider.logo"
              :src="provider.logo"
              :alt="provider.name"
              width="40"
              height="40"
              loading="lazy"
            />
            <span v-else class="provider-name">{{ provider.name }}</span>
          </li>
        </ul>
      </div>
      <p class="watch-credit">
        Availability in {{ regionName }} from
        <a
          v-if="providers.link"
          :href="providers.link"
          target="_blank"
          rel="noopener noreferrer"
          data-open-with="app"
          @click="openLink($event, providers.link)"
          >JustWatch via TMDB</a
        >
        <template v-else>JustWatch via TMDB</template>.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { contentAPI } from '@/services/api'
import { isNativeApp, openInOtherApp, viewerRegion } from '@/utils/nativeApp'

interface Provider {
  id: number
  name: string
  logo: string | null
}

interface WhereToWatchData {
  region: string
  streaming: { site: string; url: string; language: string | null }[]
  providers: { link: string | null; stream: Provider[]; buy: Provider[] }
}

const props = defineProps<{ contentId: string }>()

const data = ref<WhereToWatchData | null>(null)

const providers = computed(() => data.value?.providers ?? { link: null, stream: [], buy: [] })

const providerGroups = computed(() =>
  [
    { label: 'Streaming', items: providers.value.stream },
    { label: 'Buy or rent', items: providers.value.buy },
  ].filter((group) => group.items.length),
)

const hasAnything = computed(
  () =>
    !!data.value &&
    (data.value.streaming.length > 0 ||
      providers.value.stream.length > 0 ||
      providers.value.buy.length > 0),
)

const regionName = computed(() => {
  const region = data.value?.region || 'US'
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(region) || region
  } catch {
    return region
  }
})

/** In the app, hand streaming links to iOS so they open the service's own app. */
const openLink = (event: MouseEvent, url: string) => {
  if (!isNativeApp) return
  event.preventDefault()
  openInOtherApp(url).catch(() => {})
}

const load = async (contentId: string) => {
  data.value = null
  try {
    const response = await contentAPI.whereToWatch(contentId, viewerRegion())
    if (contentId === props.contentId) data.value = response.data.data as WhereToWatchData
  } catch {
    // Optional section: leave it hidden.
  }
}

watch(() => props.contentId, load, { immediate: true })
</script>

<style scoped>
.where-to-watch {
  margin: 2rem 0;
}

.where-to-watch h2 {
  margin: 0 0 1rem;
  color: var(--text-primary);
}

.watch-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
}

.watch-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 600;
  text-decoration: none;
  transition:
    border-color 0.2s,
    color 0.2s;
}

.watch-link:hover {
  border-color: var(--coral-primary);
  color: var(--coral-primary);
}

.watch-language {
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 500;
}

.provider-group + .provider-group {
  margin-top: 0.9rem;
}

.provider-label {
  margin: 0 0 0.5rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.provider-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.provider-list img {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

.provider-name {
  display: inline-block;
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.85rem;
}

.watch-credit {
  margin: 1rem 0 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.watch-credit a {
  color: var(--coral-primary);
}
</style>
