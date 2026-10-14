<!--
  AppSearchToggle.vue — expandable search for the app layout's top bar (component).

  A search button that opens into a field across the bar, with Cancel to close it (which
  also clears it). It stays open while it holds text, so a filtered list keeps showing
  what it's filtered by. The parent hides its other bar controls while `expanded` is on.
-->
<template>
  <form v-if="expanded" class="search-field" role="search" @submit.prevent="submit">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.9" />
      <path stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="m16 16 4 4" />
    </svg>
    <input
      ref="input"
      v-model="model"
      type="search"
      enterkeyhint="search"
      :placeholder="placeholder"
      :aria-label="placeholder"
      v-bind="$attrs"
    />
    <button type="button" class="search-cancel" @click="cancel">Cancel</button>
  </form>
  <button
    v-else
    type="button"
    class="app-bar-button"
    :aria-label="placeholder"
    data-testid="app-search-open"
    @click="open"
  >
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.9" />
      <path stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="m16 16 4 4" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { nextTick, useTemplateRef } from 'vue'

defineOptions({ inheritAttrs: false })

defineProps<{ placeholder: string }>()

const model = defineModel<string>({ required: true })
const expanded = defineModel<boolean>('expanded', { default: false })
const emit = defineEmits<{ submit: []; cancel: [] }>()

const input = useTemplateRef<HTMLInputElement>('input')

const open = async () => {
  expanded.value = true
  await nextTick()
  input.value?.focus()
}

const submit = () => {
  input.value?.blur()
  emit('submit')
}

const cancel = () => {
  model.value = ''
  expanded.value = false
  emit('cancel')
}
</script>

<style scoped>
.search-field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 38px;
  padding: 0 0 0 0.75rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(232, 237, 245, 0.7);
  animation: grow 0.22s ease-out;
}

@keyframes grow {
  from {
    opacity: 0;
    transform: scaleX(0.6);
    transform-origin: right;
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.search-field svg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}

.search-field input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  color: #f7f8fa;
  font: inherit;
  /* 16px keeps iOS from zooming into the field. */
  font-size: 16px;
  outline: none;
}

.search-field input::placeholder {
  color: rgba(232, 237, 245, 0.5);
}

.search-field input::-webkit-search-cancel-button {
  filter: invert(1);
  opacity: 0.6;
}

.search-cancel {
  flex-shrink: 0;
  height: 100%;
  padding: 0 0.85rem 0 0.4rem;
  border: none;
  background: none;
  color: var(--coral-light);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
</style>
