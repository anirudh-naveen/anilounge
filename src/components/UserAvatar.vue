<!--
  UserAvatar.vue — round profile picture with an initials fallback (component).

  Shows the user's picture, or their initials when there is none or the image
  fails to load (for example a legacy upload lost from server disk). A user who
  shows a badge emblem by their name gets that badge's ring around the picture
  (the emblem's colors and glow; Creator and Admin also shimmer). The emblem comes
  from the badges store by `name`, or from `badge` when the caller knows it.
-->
<template>
  <span
    class="user-avatar-circle"
    :class="ring && ['ringed', `ring-${ring}`]"
    :style="{ width: `${size}px`, height: `${size}px`, '--ring-width': `${ringWidth}px` }"
    :data-testid="ring ? `avatar-ring-${ring}` : undefined"
  >
    <span class="user-avatar-inner">
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
import { useBadgesStore } from '@/stores/badges'

const props = withDefaults(
  defineProps<{
    src?: string | null
    name?: string
    size?: number
    alt?: string
    /** The emblem badge to ring with; null for none; leave out to look it up by `name`. */
    badge?: string | null
  }>(),
  { src: null, name: '', size: 32, alt: '', badge: undefined },
)

/** Badges with a ring style (the emblem badges). */
const RINGS = new Set(['creator', 'admin', 'developer', 'artist', 'influencer', 'supporter', 'bot'])

// Without Pinia (isolated component tests) avatars simply go unringed.
const badgesStore = getActivePinia() ? useBadgesStore() : null

const failed = ref(false)
const url = computed(() => getAvatarUrl(props.src))
const initials = computed(() => (props.name || '?').slice(0, 2).toUpperCase())
const ring = computed(() => {
  const badge =
    props.badge !== undefined ? props.badge : (badgesStore?.featuredFor(props.name) ?? null)
  return badge && RINGS.has(badge) ? badge : null
})
const ringWidth = computed(() => Math.max(2, Math.round(props.size * 0.055)))

// A new picture gets a new URL; give it a fresh chance to load.
watch(url, () => {
  failed.value = false
})

onMounted(() => {
  if (props.badge === undefined && props.name) void badgesStore?.load()
})
</script>

<style scoped>
.user-avatar-circle {
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 50%;
}

.user-avatar-inner {
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

/* Badge rings: the emblem's gradient around the picture, with its glow. */
.ringed {
  padding: var(--ring-width);
  background: var(--ring-gradient);
  background-size: 200% 200%;
  box-shadow: 0 0 calc(var(--ring-width) * 3) var(--ring-glow);
}

.ringed .user-avatar-inner {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
}

.ring-creator {
  --ring-gradient: linear-gradient(135deg, #fff3b0, #f5b82e, #e07a5f, #f5b82e, #fff3b0);
  --ring-glow: rgba(245, 184, 46, 0.55);
  animation: ring-shimmer 4s linear infinite;
}

.ring-admin {
  --ring-gradient: linear-gradient(135deg, #e3dcff, #8f7ae6, #2bbbad, #8f7ae6, #e3dcff);
  --ring-glow: rgba(143, 122, 230, 0.5);
  animation: ring-shimmer 5s linear infinite;
}

.ring-developer {
  --ring-gradient: linear-gradient(135deg, #a7f3d0, #10b981, #0ea5e9);
  --ring-glow: rgba(16, 185, 129, 0.4);
}

.ring-artist {
  --ring-gradient: linear-gradient(135deg, #fbcfe8, #ec4899, #8b5cf6);
  --ring-glow: rgba(236, 72, 153, 0.4);
}

.ring-influencer {
  --ring-gradient: linear-gradient(135deg, #bae6fd, #38bdf8, #6366f1);
  --ring-glow: rgba(56, 189, 248, 0.4);
}

.ring-supporter {
  --ring-gradient: linear-gradient(135deg, #ffd8c9, #f47b67, #e11d48);
  --ring-glow: rgba(244, 123, 103, 0.4);
}

.ring-bot {
  --ring-gradient: linear-gradient(135deg, #cffafe, #22d3ee, #475569);
  --ring-glow: rgba(34, 211, 238, 0.4);
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
