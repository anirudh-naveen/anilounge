<!--
  SwipeRow.vue — a list row with full-swipe actions, like an alarm in the iOS Clock app.

  Dragging sideways slides the row and shows the action behind it (icon, label, tint).
  Past the threshold the action is armed (the icon pops and a haptic fires); releasing
  there, or flinging the row, commits it. Releasing before the threshold springs back.
  Vertical drags scroll the page as usual, and a tap after a drag doesn't reach the row.
  With no actions it renders its slot as is. The row's background is `--swipe-row-bg`
  (default `--bg-card`); it has to be opaque.
-->
<template>
  <div
    v-if="left || right"
    ref="root"
    class="swipe-row"
    :class="{ dragging: phase === 'dragging' }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="springBack"
    @click.capture="onClickCapture"
  >
    <div
      v-if="shown"
      class="swipe-action"
      :class="[`from-${direction}`, { armed }]"
      :style="{ '--swipe-tint': shown.color }"
      :data-testid="`swipe-action-${direction}`"
      aria-hidden="true"
    >
      <span class="swipe-action-inner">
        <svg
          class="swipe-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path v-if="shown.icon === 'plus'" d="M12 5v14M5 12h14" />
          <path v-else-if="shown.icon === 'check'" d="m5 12.5 4.5 4.5L19 7.5" />
          <template v-else>
            <circle cx="12" cy="12" r="8" />
            <path d="m6.5 6.5 11 11" />
          </template>
        </svg>
        <span class="swipe-label">{{ shown.label }}</span>
      </span>
    </div>
    <div
      class="swipe-content"
      :class="{ settling: phase === 'settling' }"
      :style="offset ? { transform: `translate3d(${offset}px, 0, 0)` } : undefined"
      @transitionend.self="onSettled"
    >
      <slot />
    </div>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { haptic } from '@/utils/nativeApp'

export interface SwipeAction {
  label: string
  icon: 'plus' | 'check' | 'drop'
  /** Background tint. */
  color: string
  /** The row stays in place after the action (it springs back instead of leaving). */
  keepsRow?: boolean
}

const props = defineProps<{
  /** Revealed by dragging the row to the left. */
  left?: SwipeAction | null
  /** Revealed by dragging the row to the right. */
  right?: SwipeAction | null
}>()

const emit = defineEmits<{ commit: [direction: 'left' | 'right'] }>()

/** Movement before a drag counts as sideways or vertical. */
const SLOP = 10
/** Release speed (px/ms) that commits a fling past half the threshold. */
const FLING_SPEED = 0.6

const root = ref<HTMLElement | null>(null)
const offset = ref(0)
const armed = ref(false)
/** idle → (pending) → dragging → settling → idle. */
const phase = ref<'idle' | 'pending' | 'dragging' | 'settling'>('idle')

let pointerId = -1
let startX = 0
let startY = 0
let width = 0
let lastX = 0
let lastTime = 0
let velocity = 0
let dragged = false
let afterSettle: (() => void) | null = null

/** The side being dragged; kept while the row settles so the action stays behind it. */
const direction = ref<'left' | 'right'>('right')
const shown = computed(() =>
  offset.value || phase.value === 'settling' ? props[direction.value] : null,
)
const threshold = () => Math.min(width * 0.38, 150)

const onPointerDown = (event: PointerEvent) => {
  if (phase.value !== 'idle' || (event.pointerType === 'mouse' && event.button !== 0)) return
  pointerId = event.pointerId
  startX = lastX = event.clientX
  startY = event.clientY
  lastTime = event.timeStamp
  velocity = 0
  width = root.value?.clientWidth || window.innerWidth
  dragged = false
  phase.value = 'pending'
}

const onPointerMove = (event: PointerEvent) => {
  if (event.pointerId !== pointerId) return
  const dx = event.clientX - startX
  if (phase.value === 'pending') {
    const dy = event.clientY - startY
    if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) {
      phase.value = 'idle' // a scroll
      return
    }
    if (Math.abs(dx) < SLOP) return
    phase.value = 'dragging'
    dragged = true
    root.value?.setPointerCapture(event.pointerId)
  }
  if (phase.value !== 'dragging') return

  const elapsed = event.timeStamp - lastTime
  if (elapsed > 0) velocity = (event.clientX - lastX) / elapsed
  lastX = event.clientX
  lastTime = event.timeStamp

  direction.value = dx < 0 ? 'left' : 'right'
  // No action that way: the row only gives a little.
  const action = dx < 0 ? props.left : props.right
  offset.value = action ? dx : dx * 0.12

  const nowArmed = !!action && Math.abs(dx) >= threshold()
  if (nowArmed && !armed.value) haptic('medium')
  armed.value = nowArmed
}

const onPointerUp = (event: PointerEvent) => {
  if (event.pointerId !== pointerId) return
  if (phase.value !== 'dragging') {
    phase.value = 'idle'
    return
  }
  const dir = direction.value
  const flung =
    !!props[dir] &&
    Math.abs(offset.value) >= threshold() / 2 &&
    Math.sign(velocity) === Math.sign(offset.value) &&
    Math.abs(velocity) >= FLING_SPEED
  if (armed.value || flung) commit(dir)
  else springBack()
}

/** Slide the row out, then report the action. */
const commit = (dir: 'left' | 'right') => {
  const action = props[dir]!
  if (!armed.value) haptic('medium')
  armed.value = true
  settleTo((dir === 'left' ? -1 : 1) * width, () => {
    emit('commit', dir)
    // A row that stays (or one whose update fails) comes back in.
    const comeBack = () => {
      armed.value = false
      settleTo(0)
    }
    if (action.keepsRow) comeBack()
    else window.setTimeout(() => offset.value && comeBack(), 600)
  })
}

const springBack = () => {
  if (phase.value === 'pending') phase.value = 'idle'
  if (phase.value !== 'dragging') return
  settleTo(0)
}

const settleTo = (target: number, then?: () => void) => {
  afterSettle = then ?? null
  if (offset.value === target) return onSettled()
  phase.value = 'settling'
  offset.value = target
}

const onSettled = () => {
  if (offset.value === 0) armed.value = false
  phase.value = 'idle'
  const next = afterSettle
  afterSettle = null
  next?.()
}

/** A drag ends with a click on iOS; keep it from opening the row. */
const onClickCapture = (event: MouseEvent) => {
  if (!dragged) return
  dragged = false
  event.stopPropagation()
  event.preventDefault()
}
</script>

<style scoped>
.swipe-row {
  position: relative;
  overflow: hidden;
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
}

.swipe-content {
  position: relative;
  /* Opaque, so the action only shows where the row has slid away. */
  background: var(--swipe-row-bg, var(--bg-card));
  will-change: transform;
}

.swipe-row.dragging .swipe-content {
  cursor: grabbing;
}

.swipe-content.settling {
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.swipe-action {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  padding: 0 1.25rem;
  color: #fff;
  background: color-mix(in srgb, var(--swipe-tint) 62%, var(--bg-card, #000));
  transition: background-color 0.18s ease;
}

.swipe-action.armed {
  background: var(--swipe-tint);
}

.swipe-action.from-left {
  justify-content: flex-end;
}

.swipe-action-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 3.5rem;
}

.swipe-icon {
  width: 1.5rem;
  height: 1.5rem;
  transform: scale(0.85);
  transition: transform 0.28s cubic-bezier(0.34, 1.8, 0.5, 1);
}

.swipe-action.armed .swipe-icon {
  transform: scale(1.3);
}

.swipe-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .swipe-content.settling {
    transition-duration: 0.12s;
  }
  .swipe-icon {
    transition: none;
  }
}
</style>
