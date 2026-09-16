<!--
  AiringBadge.vue — currently-airing tag and next-episode countdown (component).

  Card variant is a poster overlay. Chip/inline sit in meta rows. Detail shows
  the full status plus a live timer when the next air time is known.
-->
<template>
  <span v-if="visible" class="airing-badge" :class="variantClass" :title="titleText">
    <span class="airing-label">{{ label }}</span>
    <span v-if="timerText" class="airing-timer" aria-live="polite">{{ timerText }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  formatAiringStatus,
  getAiringTimerLabel,
  isCurrentlyAiring,
  type AiringFields,
} from '@/utils/airing'

const props = withDefaults(
  defineProps<{
    content: AiringFields
    variant?: 'card' | 'chip' | 'detail' | 'inline'
  }>(),
  { variant: 'card' },
)

const now = ref(Date.now())
let timerId: ReturnType<typeof setInterval> | null = null

const visible = computed(() => isCurrentlyAiring(props.content, new Date(now.value)))

const variantClass = computed(() => `airing-${props.variant}`)

const label = computed(() => {
  if (props.variant === 'detail') {
    return formatAiringStatus(props.content.malStatus) || 'Currently Airing'
  }
  return 'Airing'
})

const showTimer = computed(() => props.variant === 'chip' || props.variant === 'detail')

const timerText = computed(() => {
  if (!showTimer.value) return ''
  return getAiringTimerLabel(props.content, new Date(now.value))
})

const titleText = computed(() => {
  const next = getAiringTimerLabel(props.content, new Date(now.value))
  return next ? `Currently Airing · ${next}` : 'Currently Airing'
})

const tickMs = computed(() => (props.variant === 'detail' ? 1000 : 30_000))

const stopTimer = () => {
  if (timerId != null) {
    clearInterval(timerId)
    timerId = null
  }
}

const startTimer = () => {
  stopTimer()
  if (!showTimer.value) return
  timerId = setInterval(() => {
    now.value = Date.now()
  }, tickMs.value)
}

onMounted(startTimer)
watch(tickMs, startTimer)
onBeforeUnmount(stopTimer)
</script>

<style scoped>
.airing-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 600;
  letter-spacing: 0.4px;
  line-height: 1.2;
}

.airing-card {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 3;
  background: var(--success-color);
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  text-transform: uppercase;
  white-space: nowrap;
}

.airing-chip,
.airing-inline {
  background: var(--success-color);
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  text-transform: uppercase;
  white-space: nowrap;
}

.airing-inline {
  margin-left: 0.35rem;
  vertical-align: middle;
}

.airing-detail {
  flex-direction: column;
  align-items: flex-start;
  flex-wrap: wrap;
  background: rgba(76, 175, 80, 0.2);
  color: white;
  border: 1px solid var(--success-color);
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
  font-size: 0.95rem;
  letter-spacing: 0;
  gap: 0.15rem;
}

.airing-detail .airing-label {
  text-transform: none;
}

.airing-detail .airing-timer {
  color: var(--teal-light);
  font-weight: 500;
}

.airing-chip .airing-timer {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
  opacity: 0.95;
}
</style>
