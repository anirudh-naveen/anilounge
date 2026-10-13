<!--
  UserAvatar.vue — profile picture with an initials fallback (component).

  Shows the user's picture, or their initials when there is none or the image
  fails to load (for example a legacy upload lost from server disk). The picture
  is always a circle (white behind transparent pictures), with a ring in the user's
  accent around it (coral until they pick one). That plain ring is the User frame,
  which everyone has; badge holders can instead wear their badge's frame in the
  card-royalty theme, a silhouette behind the circle that extends past its edge: a
  crown for Creator, shield for Admin, diamond/spade/club/heart for Developer/Artist/
  Influencer/Supporter, and a lounge chair for Mascot (the bot accounts). Creator and
  Admin also shimmer. The frame and accent come from the badges store by `name`, or
  from `badge` / `accent` when the caller knows them; the signed-in user's own
  picture comes from their account, so changes show everywhere without a reload.
-->
<template>
  <span
    class="user-avatar-circle"
    :class="frame && ['ringed', `ring-${ring}`]"
    :style="frameStyle"
    :data-testid="ring ? `avatar-ring-${ring}` : undefined"
  >
    <!-- Behind the circle: the badge's silhouette, extending past its edge. -->
    <svg v-if="frame?.parts.length" class="frame" viewBox="0 0 24 24" aria-hidden="true">
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
      <g :transform="frame.transform">
        <template v-for="(part, index) in frame.parts" :key="index">
          <path
            :d="part"
            :fill="fill"
            stroke="rgba(15, 23, 42, 0.4)"
            stroke-width="0.5"
            stroke-linejoin="round"
          />
          <!-- One part (the chair's backrest) is darker, for depth. -->
          <path v-if="frame.darken === index" :d="part" fill="rgba(15, 23, 42, 0.28)" />
        </template>
      </g>
    </svg>
    <span v-if="frame" class="ring" aria-hidden="true"></span>

    <span class="user-avatar-inner" :class="{ 'has-image': url && !failed }">
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
        :style="{ fontSize: `${Math.round(size * 0.38)}px` }"
        aria-hidden="true"
      >
        {{ initials }}
      </span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getActivePinia } from 'pinia'
import { getAvatarUrl } from '@/utils/avatars'
import { frameColors } from '@/utils/accent'
import { useBadgesStore } from '@/stores/badges'
import { useAuthStore } from '@/stores/auth'
import { USER_FRAME } from '@/utils/badges'
import type { ProfileAccent } from '@/types/profile'

const props = withDefaults(
  defineProps<{
    src?: string | null
    name?: string
    size?: number
    alt?: string
    /** The frame (a badge id or 'user'); null for none; leave out to look it up by `name`. */
    badge?: string | null
    /** Their profile accent for the frame color; leave out to look it up by `name`. */
    accent?: ProfileAccent | null
  }>(),
  { src: null, name: '', size: 32, alt: '', badge: undefined, accent: undefined },
)

/** Scale a silhouette about its centre (cx, cy) and move that to the avatar's centre. */
const around = (cx: number, cy: number, scale: number) =>
  `translate(12 12) scale(${scale}) translate(${-cx} ${-cy})`

/**
 * Frame silhouettes (from BadgeEmblem) in a 24-unit box drawn 1.5x the avatar, so the
 * picture circle is radius 8 and anything past that shows around it.
 */
const FRAMES: Record<string, { parts: string[]; transform: string; darken?: number }> = {
  // The plain ring everyone has: nothing behind the circle.
  [USER_FRAME]: { parts: [], transform: '' },
  // Crown raised so its points rise above the circle.
  creator: {
    parts: [
      'M3 7.6l4.2 3.3L12 3.6l4.8 7.3L21 7.6l-1.8 9.8H4.8L3 7.6zM1.9 7.6a1.1 1.1 0 1 1 2.2 0 1.1 1.1 0 1 1-2.2 0zM10.9 3.6a1.1 1.1 0 1 1 2.2 0 1.1 1.1 0 1 1-2.2 0zM19.9 7.6a1.1 1.1 0 1 1 2.2 0 1.1 1.1 0 1 1-2.2 0z',
    ],
    transform: around(12, 15.5, 1.05),
  },
  admin: {
    parts: ['M12 2.5l8 3v6.2c0 4.9-3.4 8.6-8 9.8-4.6-1.2-8-4.9-8-9.8V5.5l8-3z'],
    transform: around(12, 12, 1.16),
  },
  developer: {
    parts: ['M12 2Q15.6 7.4 20.4 12 15.6 16.6 12 22 8.4 16.6 3.6 12 8.4 7.4 12 2z'],
    transform: around(12, 12, 1.15),
  },
  artist: {
    parts: [
      'M12 2.2C9.5 5.6 3.2 9.2 3.2 13.6 3.2 16.2 5.2 18 7.5 18c1.5 0 2.8-.7 3.5-1.7-.2 2-1 3.7-2.4 5.3h6.8c-1.4-1.6-2.2-3.3-2.4-5.3.7 1 2 1.7 3.5 1.7 2.3 0 4.3-1.8 4.3-4.4 0-4.4-6.3-8-8.8-11.4z',
    ],
    transform: around(12, 11.9, 1.13),
  },
  influencer: {
    parts: [
      'M7.7 6.9a4.3 4.3 0 1 0 8.6 0 4.3 4.3 0 1 0-8.6 0zM3.1 12.9a4.3 4.3 0 1 0 8.6 0 4.3 4.3 0 1 0-8.6 0zM12.3 12.9a4.3 4.3 0 1 0 8.6 0 4.3 4.3 0 1 0-8.6 0zM8.8 11.6a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0zM11 14c-.2 3-1 5.5-2.4 7.6h6.8C14 19.5 13.2 17 13 14z',
    ],
    transform: around(12, 12.1, 1.16),
  },
  supporter: {
    parts: [
      'M12 20.6s-8.4-4.9-8.4-11a4.7 4.7 0 0 1 8.4-2.9 4.7 4.7 0 0 1 8.4 2.9c0 6.1-8.4 11-8.4 11z',
    ],
    transform: around(12, 12.75, 1.3),
  },
  // A lounge chair (AniLounge's mascots): the picture sits in it, with the darker
  // backrest behind, armrests at the sides, and the seat base and legs below.
  bot: {
    parts: [
      'M7.5 2.4h9a3.6 3.6 0 0 1 3.6 3.6V15H3.9V6a3.6 3.6 0 0 1 3.6-3.6z',
      'M3.2 10.4a1.7 1.7 0 0 1 1.7 1.7v6.3H1.5v-6.3a1.7 1.7 0 0 1 1.7-1.7zM20.8 10.4a1.7 1.7 0 0 1 1.7 1.7v6.3h-3.4v-6.3a1.7 1.7 0 0 1 1.7-1.7z',
      'M2.6 17.8h18.8a.8.8 0 0 1 .8.8v1a.8.8 0 0 1-.8.8H2.6a.8.8 0 0 1-.8-.8v-1a.8.8 0 0 1 .8-.8zM4 20.4h1.5v1.8H4zM18.5 20.4h1.5v1.8h-1.5z',
    ],
    transform: around(12, 12, 1),
    darken: 0,
  },
}

// Without Pinia (isolated component tests) avatars simply go unringed.
const badgesStore = getActivePinia() ? useBadgesStore() : null
const authStore = getActivePinia() ? useAuthStore() : null

const reducedMotion =
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const failed = ref(false)
// The signed-in user's own avatar follows their account, so a new picture shows
// everywhere at once instead of only where the page reloaded its data.
const isSelf = computed(() => {
  const me = authStore?.user?.username
  return !!me && !!props.name && me.toLowerCase() === props.name.toLowerCase()
})
const url = computed(() =>
  getAvatarUrl(isSelf.value ? (authStore!.user!.profilePicture ?? null) : props.src),
)
const initials = computed(() => (props.name || '?').slice(0, 2).toUpperCase())
const ring = computed(() => {
  const badge =
    props.badge !== undefined ? props.badge : (badgesStore?.frameFor(props.name) ?? USER_FRAME)
  return badge && FRAMES[badge] ? badge : null
})
const frame = computed(() => (ring.value ? FRAMES[ring.value] : undefined))
const accent = computed(() =>
  props.accent !== undefined ? props.accent : (badgesStore?.accentFor(props.name) ?? null),
)
const colors = computed(() => frameColors(accent.value))
const shimmer = computed(
  () => !reducedMotion && (ring.value === 'creator' || ring.value === 'admin'),
)
const ringWidth = computed(() => Math.max(2, Math.round(props.size * 0.05)))

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

.user-avatar-inner.has-image {
  background: #fff;
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

/* Framed: a gradient ring around the circle, over the silhouette behind it. */
.ringed {
  padding: var(--ring-width);
}

.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--ring-gradient);
  background-size: 200% 200%;
}

.ring-creator .ring,
.ring-admin .ring {
  animation: ring-shimmer 4s linear infinite;
}

.ringed .user-avatar-inner {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.frame {
  position: absolute;
  inset: -25%;
  width: 150%;
  height: 150%;
  overflow: visible;
  pointer-events: none;
  filter: drop-shadow(0 0 calc(var(--ring-width) * 1.5) var(--ring-glow));
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
  .ring {
    animation: none;
  }
}
</style>
