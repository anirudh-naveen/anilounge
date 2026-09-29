<!--
  RoleBadge.vue — the emblem next to a username (component).

  Shows the one badge the person picked for their name (by default their highest:
  Creator, then Admin, Developer, Artist, Influencer), or nothing. Callers only pass
  the username; badges come from the badges store. The full list lives in the
  profile Badges section.
-->
<template>
  <span v-if="featured" class="badge-group" :data-testid="`role-badge-${featured}`">
    <BadgeEmblem :badge="featured" :size="size" />
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import BadgeEmblem from '@/components/BadgeEmblem.vue'
import { useBadgesStore } from '@/stores/badges'

const props = withDefaults(
  defineProps<{
    username?: string | null
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { username: null, size: 'sm' },
)

const badgesStore = useBadgesStore()
const featured = computed(() => badgesStore.featuredFor(props.username))

onMounted(() => {
  badgesStore.load()
})
</script>

<style scoped>
.badge-group {
  display: inline-flex;
  align-items: center;
  margin-left: 0.3em;
  vertical-align: -0.12em;
}
</style>
