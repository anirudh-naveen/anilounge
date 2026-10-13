<!--
  AppSheet.vue — a bottom sheet for the app layout (component).

  Slides up over a dimmed page with a grabber, a title, and a Done button; dragging the
  grabber or title down (or tapping outside) closes it. The page behind stops scrolling
  while it's open. Used for the Watchlist and Search filter options.
-->
<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="sheet-backdrop" @click.self="close">
        <section
          class="sheet"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          :style="
            dragOffset ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : {}
          "
        >
          <header
            class="sheet-header"
            @touchstart.passive="dragStart"
            @touchmove.passive="dragMove"
            @touchend="dragEnd"
            @touchcancel="dragEnd"
          >
            <span class="sheet-grabber" aria-hidden="true"></span>
            <button
              v-if="resetLabel"
              type="button"
              class="sheet-action sheet-reset"
              :disabled="!canReset"
              @click="emit('reset')"
            >
              {{ resetLabel }}
            </button>
            <h2 class="sheet-title">{{ title }}</h2>
            <button
              type="button"
              class="sheet-action sheet-done"
              data-testid="sheet-done"
              @click="close"
            >
              {{ doneLabel }}
            </button>
          </header>
          <div class="sheet-body">
            <slot />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'

withDefaults(
  defineProps<{
    title: string
    doneLabel?: string
    /** Shows a reset button on the left (e.g. "Reset" to clear filters). */
    resetLabel?: string
    canReset?: boolean
  }>(),
  { doneLabel: 'Done', resetLabel: '', canReset: true },
)

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ reset: []; close: [] }>()

const close = () => {
  open.value = false
  emit('close')
}

// Hold the page still behind the sheet.
watch(
  open,
  (isOpen) => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  },
  { immediate: true },
)
onUnmounted(() => {
  document.body.style.overflow = ''
})

/** Drag-to-dismiss from the header: past this many pixels, letting go closes the sheet. */
const DISMISS_PX = 90
const dragOffset = ref(0)
let startY: number | null = null

const dragStart = (event: TouchEvent) => {
  startY = event.touches[0]?.clientY ?? null
}

const dragMove = (event: TouchEvent) => {
  if (startY === null) return
  dragOffset.value = Math.max(0, (event.touches[0]?.clientY ?? startY) - startY)
}

const dragEnd = () => {
  if (dragOffset.value > DISMISS_PX) close()
  dragOffset.value = 0
  startY = null
}
</script>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(8, 14, 26, 0.45);
}

.sheet {
  width: 100%;
  max-width: 640px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  border-radius: 22px 22px 0 0;
  background: var(--bg-primary);
  box-shadow: 0 -12px 40px rgba(8, 14, 26, 0.3);
  transition: transform 0.25s ease;
}

.sheet-header {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 1.1rem 1rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  touch-action: none;
}

.sheet-grabber {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 38px;
  height: 5px;
  margin-left: -19px;
  border-radius: 999px;
  background: var(--text-muted);
  opacity: 0.45;
}

.sheet-title {
  grid-column: 2;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.sheet-action {
  border: none;
  background: none;
  font: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  padding: 0.25rem 0;
}

.sheet-reset {
  grid-column: 1;
  justify-self: start;
  color: var(--coral-deep);
  font-weight: 500;
}

.sheet-reset:disabled {
  color: var(--text-muted);
  cursor: default;
}

.sheet-done {
  grid-column: 3;
  justify-self: end;
  color: var(--coral-deep);
  font-weight: 700;
}

.sheet-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1rem 1rem calc(1.25rem + var(--safe-bottom));
}

.sheet-enter-active,
.sheet-leave-active {
  transition: background 0.25s ease;
}

.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  background: rgba(8, 14, 26, 0);
}

.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}
</style>
