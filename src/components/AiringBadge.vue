<!--
  AiringBadge.vue — currently-airing and upcoming tags (component).

  Card variant is a poster overlay. Chip/inline sit in meta rows. Detail shows
  status plus a live timer when the next air or premiere time is known.
  Airing (green) wins over upcoming (sunflower) when both could apply.
-->
<template>
  <span
    v-if="visible"
    class="airing-badge"
    :class="[variantClass, cornerClass, { upcoming: kind === 'upcoming' }]"
    :title="titleText"
  >
    <span class="airing-label">{{ label }}</span>
    <span v-if="timerText" class="airing-timer" aria-live="polite">{{ timerText }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  formatAiringStatus,
  getAiringTimerLabel,
  getUpcomingTimerLabel,
  isCurrentlyAiring,
  isUpcoming,
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

const clock = computed(() => new Date(now.value))

const kind = computed<'airing' | 'upcoming' | null>(() => {
  if (isCurrentlyAiring(props.content, clock.value)) return 'airing'
  if (isUpcoming(props.content, clock.value)) return 'upcoming'
  return null
})

const visible = computed(() => kind.value != null)

const variantClass = computed(() => `airing-${props.variant}`)

const cornerClass = computed(() =>
  props.variant === 'card' ? 'poster-corner-tag poster-corner-tag-left' : '',
)

const label = computed(() => {
  if (kind.value === 'upcoming') return 'Upcoming'
  if (props.variant === 'detail') {
    return formatAiringStatus(props.content.malStatus) || 'Currently Airing'
  }
  return 'Airing'
})

const showTimer = computed(() => props.variant === 'chip' || props.variant === 'detail')

const timerText = computed(() => {
  if (!showTimer.value) return ''
  if (kind.value === 'upcoming') return getUpcomingTimerLabel(props.content, clock.value)
  return getAiringTimerLabel(props.content, clock.value)
})

const titleText = computed(() => {
  if (kind.value === 'upcoming') {
    const next = getUpcomingTimerLabel(props.content, clock.value)
    return next ? `Upcoming · ${next}` : 'Upcoming'
  }
  const next = getAiringTimerLabel(props.content, clock.value)
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
  background: var(--success-color);
  color: white;
  line-height: 1;
  letter-spacing: 0.3px;
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

.airing-card.upcoming,
.airing-chip.upcoming,
.airing-inline.upcoming {
  background: var(--upcoming-color);
}

.airing-detail.upcoming {
  background: rgba(232, 163, 23, 0.22);
  border-color: var(--upcoming-color);
}

.airing-detail.upcoming .airing-timer {
  color: var(--upcoming-light);
}
</style>
