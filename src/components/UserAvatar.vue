<!--
  UserAvatar.vue — profile picture with an initials fallback (component).

  Shows the user's picture, or their initials when there is none or the image
  fails to load (for example a legacy upload lost from server disk). A badge holder
  gets a frame in the card-royalty theme (the badge they picked for it, else the
  emblem by their name): Creator wears a crown over a round ring, Admin/Developer/
  Artist/Influencer/Supporter crop the picture to their emblem's silhouette (shield,
  diamond, spade, club, heart) with a border around it, and Bot (the mascots, so the
  deck's Joker) wears a jester's hat over a round ring. Frames are silver until the
  user picks a profile accent, then take its shades; Creator and Admin also shimmer.
  The frame and accent come from the badges store by `name`, or from `badge` /
  `accent` when the caller knows them.
-->
<template>
  <span
    class="user-avatar-circle"
    :class="ring && ['ringed', `ring-${ring}`, shape ? 'shaped' : 'round']"
    :style="frameStyle"
    :data-testid="ring ? `avatar-ring-${ring}` : undefined"
  >
    <!-- Behind the picture: the silhouette, stroked so its outer half shows as the border. -->
    <svg v-if="shape" class="frame" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop
            v-for="(color, index) in colors"
            :key="index"
            :offset="`${(index / (colors.length - 1)) * 100}%`"
            :stop-color="color"
          />
          <animateTransform
            v-if="shimmer"
            attributeName="gradientTransform"
            type="rotate"
            from="0 0.5 0.5"
            to="360 0.5 0.5"
            dur="6s"
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>
      <path
        :d="shape.d"
        :transform="shapeTransform"
        :fill="fill"
        :stroke="fill"
        :stroke-width="frameStroke"
        stroke-linejoin="round"
      />
    </svg>

    <span class="user-avatar-inner" :style="maskStyle">
      <img
        v-if="url && !failed"
        :src="url"
        :alt="alt || `${name}'s profile picture`"
        class="user-avatar-img"
        @error="failed = true"
      />
      <span
        v-else
        class="user-avatar-initials"
        :style="{ fontSize: `${Math.round(size * (shape ? 0.32 : 0.38))}px` }"
        aria-hidden="true"
      >
        {{ initials }}
      </span>
    </span>

    <svg v-if="ring === 'creator'" class="crown" viewBox="0 2.4 24 19.6" aria-hidden="true">
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
      <path
        :fill="fill"
        stroke="rgba(15, 23, 42, 0.35)"
        stroke-width="0.6"
        stroke-linejoin="round"
        :d="CROWN"
      />
      <circle cx="12" cy="13.4" r="1.6" fill="#fff" opacity="0.9" />
    </svg>

    <svg v-else-if="ring === 'bot'" class="crown jester" viewBox="0 1.6 24 20" aria-hidden="true">
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
      <!-- Middle flap behind, darker for the jester's two-tone. -->
      <path
        :fill="fill"
        stroke="rgba(15, 23, 42, 0.35)"
        stroke-width="0.6"
        stroke-linejoin="round"
        :d="JESTER_FLAPS[1]"
      />
      <path fill="rgba(15, 23, 42, 0.28)" :d="JESTER_FLAPS[1]" />
      <path
        v-for="index in [0, 2]"
        :key="index"
        :fill="fill"
        stroke="rgba(15, 23, 42, 0.35)"
        stroke-width="0.6"
        stroke-linejoin="round"
        :d="JESTER_FLAPS[index]"
      />
      <path
        :fill="fill"
        stroke="rgba(15, 23, 42, 0.35)"
        stroke-width="0.6"
        d="M4.6 16.6h14.8a1.7 1.7 0 0 1 0 3.4H4.6a1.7 1.7 0 0 1 0-3.4z"
      />
      <circle
        v-for="[cx, cy] in BELLS"
        :key="cx"
        :cx="cx"
        :cy="cy"
        r="1.4"
        :fill="colors[0]"
        stroke="rgba(15, 23, 42, 0.35)"
        stroke-width="0.5"
      />
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getActivePinia } from 'pinia'
import { getAvatarUrl } from '@/utils/avatars'
import { frameColors } from '@/utils/accent'
import { useBadgesStore } from '@/stores/badges'
import type { ProfileAccent } from '@/types/profile'

const props = withDefaults(
  defineProps<{
    src?: string | null
    name?: string
    size?: number
    alt?: string
    /** The badge to frame with; null for none; leave out to look it up by `name`. */
    badge?: string | null
    /** Their profile accent for the frame color; leave out to look it up by `name`. */
    accent?: ProfileAccent | null
  }>(),
  { src: null, name: '', size: 32, alt: '', badge: undefined, accent: undefined },
)

/** Badges with a frame (the emblem badges). */
const RINGS = new Set(['creator', 'admin', 'developer', 'artist', 'influencer', 'supporter', 'bot'])

/**
 * Emblem silhouettes from BadgeEmblem, each with its centre and half-extent so it can
 * be scaled to fill the avatar box.
 */
const SHAPES: Record<string, { d: string; cx: number; cy: number; half: number }> = {
  admin: {
    d: 'M12 2.5l8 3v6.2c0 4.9-3.4 8.6-8 9.8-4.6-1.2-8-4.9-8-9.8V5.5l8-3z',
    cx: 12,
    cy: 12,
    half: 9.5,
  },
  developer: {
    d: 'M12 2Q15.6 7.4 20.4 12 15.6 16.6 12 22 8.4 16.6 3.6 12 8.4 7.4 12 2z',
    cx: 12,
    cy: 12,
    half: 10,
  },
  artist: {
    d: 'M12 2.2C9.5 5.6 3.2 9.2 3.2 13.6 3.2 16.2 5.2 18 7.5 18c1.5 0 2.8-.7 3.5-1.7-.2 2-1 3.7-2.4 5.3h6.8c-1.4-1.6-2.2-3.3-2.4-5.3.7 1 2 1.7 3.5 1.7 2.3 0 4.3-1.8 4.3-4.4 0-4.4-6.3-8-8.8-11.4z',
    cx: 12,
    cy: 11.9,
    half: 9.7,
  },
  influencer: {
    d: 'M7.7 6.9a4.3 4.3 0 1 0 8.6 0 4.3 4.3 0 1 0-8.6 0zM3.1 12.9a4.3 4.3 0 1 0 8.6 0 4.3 4.3 0 1 0-8.6 0zM12.3 12.9a4.3 4.3 0 1 0 8.6 0 4.3 4.3 0 1 0-8.6 0zM8.8 11.6a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0zM11 14c-.2 3-1 5.5-2.4 7.6h6.8C14 19.5 13.2 17 13 14z',
    cx: 12,
    cy: 12.1,
    half: 9.5,
  },
  supporter: {
    d: 'M12 20.6s-8.4-4.9-8.4-11a4.7 4.7 0 0 1 8.4-2.9 4.7 4.7 0 0 1 8.4 2.9c0 6.1-8.4 11-8.4 11z',
    cx: 12,
    cy: 12.75,
    half: 8.4,
  },
}

const CROWN =
  'M3 7.6l4.2 3.3L12 3.6l4.8 7.3L21 7.6l-1.8 9.8H4.8L3 7.6zM6 18.7h12a1.1 1.1 0 0 1 0 2.2H6a1.1 1.1 0 0 1 0-2.2zM1.9 7.6a1.1 1.1 0 1 1 2.2 0 1.1 1.1 0 1 1-2.2 0zM10.9 3.6a1.1 1.1 0 1 1 2.2 0 1.1 1.1 0 1 1-2.2 0zM19.9 7.6a1.1 1.1 0 1 1 2.2 0 1.1 1.1 0 1 1-2.2 0z'

/** Jester's cap flaps (left, middle, right), each curling over to a bell. */
const JESTER_FLAPS = [
  'M5.2 17C5 12.2 4.3 9.8 2.7 10.1c-1 .2-1.4 1.1-1.4 2.3C0 9 1.5 5 5.5 4.7c3-.2 4.7 3.2 5.3 8.3z',
  'M9.4 17C9.6 10 10.6 5 13 3c1.6-1.3 3.6-1 4.6.4-1.2-.4-2.4 0-3 1.2-1 2-1.2 6.6-.8 12.4z',
  'M18.8 17C19 12.2 19.7 9.8 21.3 10.1c1 .2 1.4 1.1 1.4 2.3C24 9 22.5 5 18.5 4.7c-3-.2-4.7 3.2-5.3 8.3z',
]
const BELLS = [
  [1.3, 12.4],
  [17.6, 3.4],
  [22.7, 12.4],
]

// Without Pinia (isolated component tests) avatars simply go unringed.
const badgesStore = getActivePinia() ? useBadgesStore() : null

const reducedMotion =
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const failed = ref(false)
const url = computed(() => getAvatarUrl(props.src))
const initials = computed(() => (props.name || '?').slice(0, 2).toUpperCase())
const ring = computed(() => {
  const badge =
    props.badge !== undefined ? props.badge : (badgesStore?.frameFor(props.name) ?? null)
  return badge && RINGS.has(badge) ? badge : null
})
const shape = computed(() => (ring.value ? SHAPES[ring.value] : undefined))
const accent = computed(() =>
  props.accent !== undefined ? props.accent : (badgesStore?.accentFor(props.name) ?? null),
)
const colors = computed(() => frameColors(accent.value))
const shimmer = computed(
  () => !reducedMotion && (ring.value === 'creator' || ring.value === 'admin'),
)
const ringWidth = computed(() => Math.max(2, Math.round(props.size * 0.055)))

/** Border width in the 24-unit viewBox; the stroke is doubled since only its outer half shows. */
const ringUnits = computed(() => (ringWidth.value * 24) / props.size)
const frameStroke = computed(() => ringUnits.value * 2)
const shapeScale = computed(() =>
  shape.value ? (12 - ringUnits.value * 0.7) / shape.value.half : 1,
)
const shapeTransform = computed(() =>
  shape.value
    ? `translate(12 12) scale(${shapeScale.value.toFixed(3)}) translate(${-shape.value.cx} ${-shape.value.cy})`
    : undefined,
)

const maskStyle = computed(() => {
  if (!shape.value) return undefined
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path transform="${shapeTransform.value}" d="${shape.value.d}"/></svg>`
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`
  return { mask, WebkitMask: mask }
})

const frameStyle = computed(() => {
  const [light, mid, dark, sheen] = colors.value
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    '--ring-width': `${ringWidth.value}px`,
    '--ring-gradient': `linear-gradient(135deg, ${light}, ${mid}, ${dark}, ${sheen}, ${light})`,
    '--ring-glow': `color-mix(in srgb, ${mid} 55%, transparent)`,
  }
})

// Each avatar needs its own gradient id; SVG ids are document-global.
const gradientId = `avatar-frame-${Math.random().toString(36).slice(2, 9)}`
const fill = `url(#${gradientId})`

// A new picture gets a new URL; give it a fresh chance to load.
watch(url, () => {
  failed.value = false
})

onMounted(() => {
  if ((props.badge === undefined || props.accent === undefined) && props.name)
    void badgesStore?.load()
})
</script>

<style scoped>
.user-avatar-circle {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 50%;
}

.user-avatar-inner {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 50%;
  background: var(--profile-accent, var(--blend-color));
}

.user-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar-initials {
  color: #fff;
  font-weight: 700;
  line-height: 1;
}

/* Round frames (Creator, Bot): the frame gradient around the picture, with its glow. */
.ringed.round {
  padding: var(--ring-width);
  background: var(--ring-gradient);
  background-size: 200% 200%;
  box-shadow: 0 0 calc(var(--ring-width) * 3) var(--ring-glow);
}

.ringed.round .user-avatar-inner {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.ring-creator.round {
  animation: ring-shimmer 4s linear infinite;
}

/* Shaped frames: the picture is masked to the silhouette drawn behind it. */
.ringed.shaped {
  border-radius: 0;
}

.ringed.shaped .user-avatar-inner {
  border-radius: 0;
}

.frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 0 calc(var(--ring-width) * 1.5) var(--ring-glow));
}

/* Creator's crown and Bot's jester hat, perched on top of the ring. */
.crown {
  position: absolute;
  left: 50%;
  top: -26%;
  width: 60%;
  height: auto;
  overflow: visible;
  transform: translateX(-50%) rotate(-8deg);
  filter: drop-shadow(0 0 calc(var(--ring-width) * 1.2) var(--ring-glow));
  pointer-events: none;
}

.crown.jester {
  top: -24%;
  width: 72%;
  transform: translateX(-50%) rotate(8deg);
}

@keyframes ring-shimmer {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ringed {
    animation: none;
  }
}
</style>
