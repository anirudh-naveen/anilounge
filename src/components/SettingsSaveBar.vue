<!--
  SettingsSaveBar.vue — Save/Discard footer for one Settings section (component).

  Settings sections stage their changes and apply them only on Save, so flipping
  a control back and forth doesn't fire a request (and a toast) each time.
-->
<template>
  <div class="save-bar" :class="{ dirty }">
    <span class="save-status" aria-live="polite">{{ dirty ? 'Unsaved changes' : '' }}</span>
    <button
      v-if="dirty"
      type="button"
      class="btn btn-ghost btn-small"
      :disabled="saving"
      @click="emit('discard')"
    >
      Discard
    </button>
    <button
      type="button"
      class="btn btn-primary btn-small"
      :disabled="!dirty || saving"
      :data-testid="testid"
      @click="emit('save')"
    >
      {{ saving ? 'Saving…' : 'Save' }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ dirty: boolean; saving?: boolean; testid?: string }>()
const emit = defineEmits<{ save: []; discard: [] }>()
</script>

<style scoped>
.save-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.save-status {
  margin-right: auto;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--coral-deep);
}
</style>
