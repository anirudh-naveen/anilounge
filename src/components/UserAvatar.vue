<!--
  UserAvatar.vue — round profile picture with an initials fallback (component).

  Shows the user's picture, or their initials when there is none or the image
  fails to load (for example a legacy upload lost from server disk).
-->
<template>
  <span class="user-avatar-circle" :style="{ width: `${size}px`, height: `${size}px` }">
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
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getAvatarUrl } from '@/utils/avatars'

const props = withDefaults(
  defineProps<{
    src?: string | null
    name?: string
    size?: number
    alt?: string
  }>(),
  { src: null, name: '', size: 32, alt: '' },
)

const failed = ref(false)
const url = computed(() => getAvatarUrl(props.src))
const initials = computed(() => (props.name || '?').slice(0, 2).toUpperCase())

// A new picture gets a new URL; give it a fresh chance to load.
watch(url, () => {
  failed.value = false
})
</script>

<style scoped>
.user-avatar-circle {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
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
</style>
