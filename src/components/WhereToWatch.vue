<!--
  WhereToWatch.vue — where a title can be watched, as a row of logos (component).

  Each logo opens the title on that service: AniList's direct links first (in the iOS
  app they open the service's own app when installed), then the services that carry it
  in the viewer's country, from TMDB (data by JustWatch, which must be credited).
  Hovering a logo names the service. Renders nothing when there is nothing to show.
-->
<template>
  <section v-if="logos.length" class="where-to-watch" data-testid="where-to-watch">
    <h2>Where to watch</h2>

    <ul class="watch-logos">
      <li v-for="logo in logos" :key="logo.key">
        <a
          :href="logo.url || undefined"
          target="_blank"
          rel="noopener noreferrer"
          class="watch-logo"
          :title="logo.name"
          :aria-label="logo.name"
          data-open-with="app"
          :data-testid="`watch-logo-${logo.key}`"
          @click="logo.url ? openLink($event, logo.url) : $event.preventDefault()"
        >
          <img
            v-if="logo.image"
            :src="logo.image"
            :alt="logo.name"
            :style="logo.color ? { background: logo.color } : undefined"
            :class="{ icon: logo.isIcon }"
            width="44"
            height="44"
            loading="lazy"
          />
          <span v-else class="logo-initial">{{ logo.name.charAt(0) }}</span>
        </a>
      </li>
    </ul>

    <p v-if="providers.stream.length || providers.buy.length" class="watch-credit">
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
  streaming: {
    site: string
    url: string
    language: string | null
    icon?: string | null
    color?: string | null
  }[]
  providers: { link: string | null; stream: Provider[]; buy: Provider[] }
}

const props = defineProps<{ contentId: string }>()

const data = ref<WhereToWatchData | null>(null)

const providers = computed(() => data.value?.providers ?? { link: null, stream: [], buy: [] })

/** Lowercase name without spaces or "+", so "Netflix" matches "Netflix Standard with Ads". */
const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * One logo per service: direct links first, then TMDB's services not already linked
 * (streaming, then buy or rent), each opening TMDB's list for the viewer's country.
 */
const logos = computed(() => {
  const direct = (data.value?.streaming || []).map((link) => ({
    key: `link-${link.site}`,
    name:
      link.language && link.language !== 'English' ? `${link.site} (${link.language})` : link.site,
    url: link.url,
    image: link.icon || null,
    color: link.color || null,
    isIcon: true,
  }))
  const linked = (data.value?.streaming || []).map((link) => nameKey(link.site))
  const covered = (name: string) =>
    linked.some((site) => site && (nameKey(name) === site || nameKey(name).startsWith(site)))
  const fromTmdb = (list: Provider[], suffix: string) =>
    list
      .filter((provider) => !covered(provider.name))
      .map((provider) => ({
        key: `provider-${provider.id}`,
        name: `${provider.name}${suffix}`,
        url: providers.value.link,
        image: provider.logo,
        color: null,
        isIcon: false,
      }))
  return [
    ...direct,
    ...fromTmdb(providers.value.stream, ''),
    ...fromTmdb(providers.value.buy, ' (buy or rent)'),
  ]
})

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
  margin: 0 0 2rem;
}

.where-to-watch h2 {
  margin: 0 0 1rem;
  color: var(--text-primary);
}

.watch-logos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.watch-logo {
  display: block;
  border-radius: 12px;
  outline-offset: 3px;
  transition: transform 0.15s ease;
}

.watch-logo:hover,
.watch-logo:focus-visible {
  transform: translateY(-2px);
}

.watch-logo img {
  display: block;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
}

/* AniList icons are small marks: pad them on their brand color. */
.watch-logo img.icon {
  padding: 9px;
  object-fit: contain;
  background: var(--bg-card);
}

.logo-initial {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-weight: 700;
}

.watch-credit {
  margin: 0.75rem 0 0;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.watch-credit a {
  color: var(--coral-primary);
}
</style>
