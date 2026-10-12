<!--
  TitlePill.vue — a labelled pill on a title's header card (component).

  "FRANCHISE  Jujutsu Kaisen ★ 8.6", "STUDIO  [logo] MAPPA": a small label, an
  optional logo, the name, and an optional rating. Links when given `to`.
-->
<template>
  <component
    :is="to ? RouterLink : 'span'"
    v-bind="to ? { to } : {}"
    class="title-pill"
    :class="{ linked: Boolean(to) }"
  >
    <span class="pill-label">{{ label }}</span>
    <span v-if="logo !== undefined" class="pill-logo" aria-hidden="true">
      <img v-if="logo && !logoFailed" :src="logo" alt="" @error="logoFailed = true" />
      <span v-else>{{ name.charAt(0) }}</span>
    </span>
    <span class="pill-name" data-testid="pill-name">{{ name }}</span>
    <span v-if="rating" class="pill-rating" :title="ratingTitle">
      <ForumIcon name="star" filled class="pill-star" />
      {{ rating.toFixed(1) }}
    </span>
  </component>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import ForumIcon from '@/components/ForumIcon.vue'

const props = defineProps<{
  label: string
  name: string
  to?: RouteLocationRaw | null
  /** Logo URL; '' shows the name's initial; leave out for no logo slot. */
  logo?: string
  rating?: number | null
  ratingTitle?: string
}>()

const logoFailed = ref(false)
watch(
  () => props.logo,
  () => {
    logoFailed.value = false
  },
)
</script>

<style scoped>
.title-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  max-width: 100%;
  padding: 0.35rem 0.9rem 0.35rem 0.4rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.9rem;
  text-decoration: none;
  transition: border-color 0.2s ease;
}

.title-pill.linked:hover {
  border-color: var(--coral-primary);
}

.pill-label {
  flex-shrink: 0;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: var(--bg-hover);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pill-logo {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 3px;
  border-radius: 6px;
  background: #fff;
  color: #1a1a2e;
  font-size: 0.8rem;
  font-weight: 700;
  overflow: hidden;
}

.pill-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pill-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.linked .pill-name {
  color: var(--coral-primary);
}

.pill-rating {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  color: var(--text-muted);
}

.pill-star {
  color: #f5c518;
}
</style>
