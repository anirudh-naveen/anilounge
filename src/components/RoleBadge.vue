<!--
  RoleBadge.vue — sparkly creator/admin mark shown next to a username (component).

  Renders nothing for regular users. The creator gets a gold crown, admins a
  violet shield; both shimmer and twinkle (still under prefers-reduced-motion).
  Roles come from the staff store, so callers only pass the username.
-->
<template>
  <span
    v-if="role"
    class="role-badge"
    :class="[role, `size-${size}`]"
    :title="label"
    role="img"
    :aria-label="label"
    :data-testid="`role-badge-${role}`"
  >
    <svg v-if="role === 'creator'" viewBox="0 0 24 24" class="role-icon" aria-hidden="true">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff3b0" />
          <stop offset="45%" stop-color="#f5b82e" />
          <stop offset="100%" stop-color="#e07a5f" />
        </linearGradient>
      </defs>
      <path
        :fill="`url(#${gradientId})`"
        d="M3 8.5l4.2 3.3L12 4.5l4.8 7.3L21 8.5l-1.8 10H4.8L3 8.5z"
      />
      <rect x="4.8" y="19.6" width="14.4" height="2" rx="1" :fill="`url(#${gradientId})`" />
      <circle cx="12" cy="14.6" r="1.6" fill="#fff" opacity="0.9" />
    </svg>
    <svg v-else viewBox="0 0 24 24" class="role-icon" aria-hidden="true">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e3dcff" />
          <stop offset="50%" stop-color="#8f7ae6" />
          <stop offset="100%" stop-color="#2bbbad" />
        </linearGradient>
      </defs>
      <path
        :fill="`url(#${gradientId})`"
        d="M12 2.5l8 3v6.2c0 4.9-3.4 8.6-8 9.8-4.6-1.2-8-4.9-8-9.8V5.5l8-3z"
      />
      <path
        fill="#fff"
        opacity="0.95"
        d="M12 7.2l1.2 2.7 2.9.3-2.2 1.9.7 2.9L12 13.5 9.4 15l.7-2.9-2.2-1.9 2.9-.3L12 7.2z"
      />
    </svg>
    <span class="sparkle s1" aria-hidden="true"></span>
    <span class="sparkle s2" aria-hidden="true"></span>
    <span class="sparkle s3" aria-hidden="true"></span>
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useStaffStore } from '@/stores/staff'

const props = withDefaults(
  defineProps<{
    username?: string | null
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { username: null, size: 'sm' },
)

const staffStore = useStaffStore()
const role = computed(() => staffStore.roleFor(props.username))
const label = computed(() => (role.value === 'creator' ? 'AniLounge creator' : 'AniLounge admin'))
// Each badge needs its own gradient id; SVG ids are document-global.
const gradientId = `role-grad-${Math.random().toString(36).slice(2, 9)}`

onMounted(() => {
  staffStore.load()
})
</script>

<style scoped>
.role-badge {
  --badge: 1.05em;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--badge);
  height: var(--badge);
  margin-left: 0.3em;
  vertical-align: -0.12em;
  flex-shrink: 0;
  cursor: default;
}

.role-badge.size-md {
  --badge: 1.25em;
}

.role-badge.size-lg {
  --badge: 0.8em;
  margin-left: 0.25em;
}

.role-icon {
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: badge-glow 2.8s ease-in-out infinite;
}

.creator .role-icon {
  filter: drop-shadow(0 0 3px rgba(245, 184, 46, 0.75));
}

.admin .role-icon {
  filter: drop-shadow(0 0 3px rgba(143, 122, 230, 0.7));
}

/* Light sweep across the icon. */
.role-badge::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.85) 50%, transparent 65%);
  background-size: 250% 100%;
  mix-blend-mode: overlay;
  animation: badge-shine 3.2s ease-in-out infinite;
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

@keyframes badge-shine {
  0% {
    background-position: 150% 0;
  }
  60%,
  100% {
    background-position: -100% 0;
  }
}

@keyframes badge-glow {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .role-icon,
  .role-badge::after {
    animation: none;
  }

  .sparkle {
    animation: none;
    opacity: 0.8;
    transform: none;
  }
}
</style>
