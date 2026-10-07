<!--
  ProviderLogo.vue — AniList / MyAnimeList / TMDB app icon (component).

  Rounded-square marks in each site's colours, drawn inline so the Connections page
  needs no third-party image requests.
-->
<template>
  <svg
    class="provider-logo"
    :style="{ width: `${size}px`, height: `${size}px` }"
    viewBox="0 0 32 32"
    role="img"
    :aria-label="`${label} logo`"
  >
    <template v-if="provider === 'anilist'">
      <rect width="32" height="32" rx="7" fill="#152232" />
      <g transform="translate(4 4)">
        <path
          fill="#02A9FF"
          d="M24 17.53v2.421c0 .71-.391 1.101-1.1 1.101h-5l-.057-.165L11.84 3.736c.106-.502.46-.788 1.053-.788h2.422c.71 0 1.1.391 1.1 1.1v12.38H22.9c.71 0 1.1.392 1.1 1.101z"
        />
        <path
          fill="#FFFFFF"
          d="M11.034 2.947l6.337 18.104h-4.918l-1.052-3.131H6.019l-1.077 3.131H0L6.337 2.948h4.697zm-.889 10.96-1.61-5.014-1.716 5.015h3.326z"
        />
      </g>
    </template>

    <template v-else-if="provider === 'mal'">
      <rect width="32" height="32" rx="7" fill="#2E51A2" />
      <text
        x="16"
        y="20.2"
        text-anchor="middle"
        fill="#FFFFFF"
        font-family="Arial, Helvetica, sans-serif"
        font-size="10.5"
        font-weight="700"
        letter-spacing="-0.3"
      >
        MAL
      </text>
    </template>

    <template v-else>
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#90CEA1" />
          <stop offset="0.56" stop-color="#3CBEC9" />
          <stop offset="1" stop-color="#00B3E5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#0D253F" />
      <text
        x="16"
        y="19.6"
        text-anchor="middle"
        :fill="`url(#${gradientId})`"
        font-family="Arial, Helvetica, sans-serif"
        font-size="9"
        font-weight="800"
        letter-spacing="-0.2"
      >
        TMDB
      </text>
      <rect x="7" y="22.4" width="18" height="2" rx="1" :fill="`url(#${gradientId})`" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import type { ConnectionProvider } from '@/types'

const props = withDefaults(defineProps<{ provider: ConnectionProvider; size?: number }>(), {
  size: 44,
})

const gradientId = `tmdb-gradient-${useId()}`

const label = computed(
  () => ({ anilist: 'AniList', mal: 'MyAnimeList', tmdb: 'TMDB' })[props.provider],
)
</script>

<style scoped>
.provider-logo {
  display: block;
  flex-shrink: 0;
  border-radius: 22%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}
</style>
