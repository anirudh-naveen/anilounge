<!--
  PasswordInput.vue — a password field with an eye button to show or hide what's typed
  (component).

  Drop-in for `<input type="password">`: v-model, class, placeholder, autocomplete, and
  other attributes all land on the input itself.
-->
<template>
  <span class="password-field">
    <input v-model="model" v-bind="$attrs" :type="visible ? 'text' : 'password'" />
    <button
      type="button"
      class="password-toggle"
      :aria-label="visible ? 'Hide password' : 'Show password'"
      :aria-pressed="visible"
      data-testid="password-toggle"
      @click="visible = !visible"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="3" />
        <path v-if="visible" d="m4 4 16 16" />
      </svg>
    </button>
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ required: true })
const visible = ref(false)
</script>

<style scoped>
.password-field {
  position: relative;
  display: block;
  width: 100%;
}

.password-field input {
  width: 100%;
  padding-right: 2.75rem;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 0.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  transform: translateY(-50%);
}

.password-toggle:hover,
.password-toggle[aria-pressed='true'] {
  color: var(--coral-primary);
}

.password-toggle:focus-visible {
  outline: 2px solid var(--coral-primary);
  outline-offset: 1px;
}

.password-toggle svg {
  width: 19px;
  height: 19px;
}
</style>
