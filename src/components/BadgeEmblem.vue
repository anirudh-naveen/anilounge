<!--
  BadgeEmblem.vue — the emblem for one badge (component).

  Creator: sparkly gold crown. Admin: sparkly violet shield. Developer: emerald hex
  with </>. Artist: pink palette. Influencer: sky disc with a megaphone. Supporter: coral heart with a
  coin glint. All glow and
  catch a light sweep; only creator/admin twinkle. Badges without an emblem (future
  ones) get a plain medal, used in the profile Badges section.
-->
<template>
  <span
    class="emblem"
    :class="[kind, `size-${size}`]"
    :title="tooltip ? info.label : undefined"
    role="img"
    :aria-label="info.label"
    :data-testid="`emblem-${badge}`"
  >
    <svg viewBox="0 0 24 24" class="emblem-icon" aria-hidden="true">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop
            v-for="(color, index) in colors"
            :key="index"
            :offset="`${(index / (colors.length - 1)) * 100}%`"
            :stop-color="color"
          />
        </linearGradient>
      </defs>

      <template v-if="kind === 'creator'">
        <path :fill="fill" d="M3 8.5l4.2 3.3L12 4.5l4.8 7.3L21 8.5l-1.8 10H4.8L3 8.5z" />
        <rect x="4.8" y="19.6" width="14.4" height="2" rx="1" :fill="fill" />
        <circle cx="12" cy="14.6" r="1.6" fill="#fff" opacity="0.9" />
      </template>

      <template v-else-if="kind === 'admin'">
        <path :fill="fill" d="M12 2.5l8 3v6.2c0 4.9-3.4 8.6-8 9.8-4.6-1.2-8-4.9-8-9.8V5.5l8-3z" />
        <path
          fill="#fff"
          opacity="0.95"
          d="M12 7.2l1.2 2.7 2.9.3-2.2 1.9.7 2.9L12 13.5 9.4 15l.7-2.9-2.2-1.9 2.9-.3L12 7.2z"
        />
      </template>

      <template v-else-if="kind === 'developer'">
        <path :fill="fill" d="M12 2.2l8.5 4.9v9.8L12 21.8l-8.5-4.9V7.1z" />
        <path
          fill="none"
          stroke="#fff"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9.3 9.2 6.8 12l2.5 2.8M14.7 9.2l2.5 2.8-2.5 2.8M12.9 8.2l-1.8 7.6"
        />
      </template>

      <template v-else-if="kind === 'artist'">
        <path
          :fill="fill"
          d="M12 3c-5 0-9 3.6-9 8.2 0 3.2 2.4 4.6 4.4 4.1 1.5-.4 2.6.6 2.6 2 0 1.7 1.3 3 3.1 2.7C18 19.4 21 16 21 11.5 21 6.8 17 3 12 3z"
        />
        <circle cx="7.8" cy="10.6" r="1.35" fill="#fff" />
        <circle cx="10.8" cy="7.2" r="1.35" fill="#fff" />
        <circle cx="15" cy="7.6" r="1.35" fill="#fff" />
        <circle cx="17.1" cy="11.2" r="1.35" fill="#fff" />
      </template>

      <template v-else-if="kind === 'influencer'">
        <circle cx="12" cy="12" r="9.5" :fill="fill" />
        <path fill="#fff" d="M6.6 10.4v3.2h2l4.3 2.7V7.7L8.6 10.4h-2z" />
        <path
          fill="none"
          stroke="#fff"
          stroke-width="1.5"
          stroke-linecap="round"
          d="M15 10.1a2.6 2.6 0 0 1 0 3.8M16.9 8.3a5.3 5.3 0 0 1 0 7.4"
        />
      </template>

      <template v-else-if="kind === 'supporter'">
        <path
          :fill="fill"
          d="M12 20.6s-8.4-4.9-8.4-11a4.7 4.7 0 0 1 8.4-2.9 4.7 4.7 0 0 1 8.4 2.9c0 6.1-8.4 11-8.4 11z"
        />
        <path
          fill="none"
          stroke="#fff"
          stroke-width="1.6"
          stroke-linecap="round"
          opacity="0.9"
          d="M7.4 9.2a2.4 2.4 0 0 1 2.2-2.1"
        />
        <circle cx="15.2" cy="11.4" r="2.3" fill="#fff" opacity="0.92" />
      </template>

      <!-- Future badges without their own emblem: a plain medal. -->
      <template v-else>
        <path :fill="fill" d="M8 2.5h3l1 4-2.6 1.2zM16 2.5h-3l-1 4 2.6 1.2z" opacity="0.7" />
        <circle cx="12" cy="14" r="7" :fill="fill" />
        <path
          fill="#fff"
          d="M12 10.2l1.1 2.3 2.5.3-1.9 1.7.5 2.5L12 15.8l-2.2 1.2.5-2.5-1.9-1.7 2.5-.3z"
        />
      </template>
    </svg>
    <template v-if="kind === 'creator' || kind === 'admin'">
      <span class="sparkle s1" aria-hidden="true"></span>
      <span class="sparkle s2" aria-hidden="true"></span>
      <span class="sparkle s3" aria-hidden="true"></span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { badgeInfo } from '@/utils/badges'

const props = withDefaults(
  defineProps<{
    badge: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Native hover title; off where the caller shows its own tooltip. */
    tooltip?: boolean
  }>(),
  { size: 'sm', tooltip: true },
)

const EMBLEMS = ['creator', 'admin', 'developer', 'artist', 'influencer', 'supporter']
const COLORS: Record<string, string[]> = {
  creator: ['#fff3b0', '#f5b82e', '#e07a5f'],
  admin: ['#e3dcff', '#8f7ae6', '#2bbbad'],
  developer: ['#a7f3d0', '#10b981', '#0ea5e9'],
  artist: ['#fbcfe8', '#ec4899', '#8b5cf6'],
  influencer: ['#bae6fd', '#38bdf8', '#6366f1'],
  supporter: ['#ffd8c9', '#f47b67', '#e11d48'],
  medal: ['#f1f5f9', '#94a3b8', '#64748b'],
}

const info = computed(() => badgeInfo(props.badge))
const kind = computed(() => (EMBLEMS.includes(props.badge) ? props.badge : 'medal'))
const colors = computed(() => COLORS[kind.value]!)
// Each emblem needs its own gradient id; SVG ids are document-global.
const gradientId = `emblem-grad-${Math.random().toString(36).slice(2, 9)}`
const fill = `url(#${gradientId})`
</script>

<style scoped>
.emblem {
  --size: 1.05em;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size);
  height: var(--size);
  flex-shrink: 0;
  cursor: default;
}

.emblem.size-md {
  --size: 1.25em;
}

/* Inside large headings, where 1em is already big. */
.emblem.size-lg {
  --size: 0.8em;
}

/* Badge cards on the profile. */
.emblem.size-xl {
  --size: 2.2rem;
}

.emblem-icon {
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: emblem-glow 2.8s ease-in-out infinite;
}

.creator .emblem-icon {
  filter: drop-shadow(0 0 3px rgba(245, 184, 46, 0.75));
}

.admin .emblem-icon {
  filter: drop-shadow(0 0 3px rgba(143, 122, 230, 0.7));
}

.developer .emblem-icon {
  filter: drop-shadow(0 0 3px rgba(16, 185, 129, 0.6));
}

.artist .emblem-icon {
  filter: drop-shadow(0 0 3px rgba(236, 72, 153, 0.55));
}

.influencer .emblem-icon {
  filter: drop-shadow(0 0 3px rgba(56, 189, 248, 0.6));
}

.supporter .emblem-icon {
  filter: drop-shadow(0 0 3px rgba(244, 123, 103, 0.6));
}

.medal .emblem-icon {
  animation: none;
  filter: drop-shadow(0 1px 1px rgba(21, 34, 56, 0.25));
}

/* Light sweep across the emblem. */
.emblem:not(.medal)::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(
    115deg,
    transparent 35%,
    rgba(255, 255, 255, 0.85) 50%,
    transparent 65%
  );
  background-size: 250% 100%;
  mix-blend-mode: overlay;
  animation: emblem-shine 3.2s ease-in-out infinite;
  pointer-events: none;
}

.sparkle {
  position: absolute;
  width: 0.34em;
  height: 0.34em;
  pointer-events: none;
  opacity: 0;
  background: currentColor;
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  animation: twinkle 2.4s ease-in-out infinite;
}

.creator .sparkle {
  color: #ffd95a;
}

.admin .sparkle {
  color: #b9a8ff;
}

.sparkle.s1 {
  top: -0.2em;
  right: -0.25em;
}

.sparkle.s2 {
  bottom: -0.1em;
  left: -0.3em;
  width: 0.26em;
  height: 0.26em;
  animation-delay: 0.8s;
}

.sparkle.s3 {
  top: 0.1em;
  left: -0.35em;
  width: 0.2em;
  height: 0.2em;
  animation-delay: 1.6s;
}

@keyframes twinkle {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.3) rotate(0deg);
  }
  45% {
    opacity: 1;
    transform: scale(1) rotate(45deg);
  }
  70% {
    opacity: 0;
    transform: scale(0.4) rotate(90deg);
  }
}

@keyframes emblem-shine {
  0% {
    background-position: 150% 0;
  }
  60%,
  100% {
    background-position: -100% 0;
  }
}

@keyframes emblem-glow {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .emblem-icon,
  .emblem::after {
    animation: none;
  }

  .sparkle {
    animation: none;
    opacity: 0.8;
    transform: none;
  }
}
</style>
