<!--
  ProfileCustomizePanel.vue — the profile Customize modal (component).

  A live preview of the avatar, name, and emblem sits on top; below it, grouped
  sections: Look (picture, accent, badge next to the name, avatar frame), About
  (headline, bio, genres), Visibility, and Tabs. Edits stay in a local draft until
  Save, which hands the whole draft to the parent to send; picture uploads apply
  immediately (ProfilePictureEditor). Badge and frame pickers only show for badge
  holders.
-->
<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <form
      class="customize-panel"
      :style="accentStyle"
      data-testid="customize-panel"
      @submit.prevent="save"
    >
      <header class="panel-header">
        <h2>Customize profile</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="emit('close')">
          <span aria-hidden="true">&times;</span>
        </button>
      </header>

      <div class="panel-body">
        <!-- Title: Preview -->
        <section class="preview" data-testid="customize-preview">
          <UserAvatar
            :src="picture"
            :name="username"
            :badge="previewFrame"
            :accent="draft.accent"
            :size="76"
          />
          <div class="preview-text">
            <span class="preview-name">
              {{ username }}
              <BadgeEmblem v-if="previewEmblem" :badge="previewEmblem" size="md" />
            </span>
            <span class="preview-headline">{{ draft.headline || 'No headline yet' }}</span>
            <ProfilePictureEditor :preview="false" @changed="(url) => emit('picture', url)" />
          </div>
        </section>

        <!-- Title: Look -->
        <section class="group">
          <h3 class="group-title">Look</h3>

          <div class="field">
            <span class="field-label">Accent color</span>
            <div class="swatches">
              <!-- Default: never picked; silver profile and avatar frame. -->
              <button
                type="button"
                class="swatch swatch-default"
                :class="{ selected: !draft.accent }"
                title="Silver (default)"
                aria-label="silver"
                data-testid="accent-default"
                @click="draft.accent = null"
              ></button>
              <button
                v-for="(color, name) in ACCENT_PRESETS"
                :key="name"
                type="button"
                class="swatch"
                :class="{ selected: draft.accent === name }"
                :style="{ background: color }"
                :aria-label="name"
                @click="draft.accent = name"
              ></button>
              <!-- Color wheel: any custom color. -->
              <label
                class="swatch swatch-wheel"
                :class="{ selected: isCustomAccent(draft.accent) }"
                title="Pick any color"
              >
                <span
                  v-if="isCustomAccent(draft.accent)"
                  class="wheel-dot"
                  :style="{ background: draft.accent }"
                ></span>
                <input
                  type="color"
                  class="wheel-input"
                  :value="accentColor(draft.accent)"
                  aria-label="Custom accent color"
                  data-testid="accent-wheel"
                  @input="pickCustomAccent"
                />
              </label>
              <span v-if="isCustomAccent(draft.accent)" class="custom-hex">{{ draft.accent }}</span>
            </div>
          </div>

          <div v-if="emblemBadges.length" class="field">
            <span class="field-label">Badge next to my name</span>
            <div class="choices" role="radiogroup" data-testid="emblem-picker">
              <button
                v-for="option in emblemOptions"
                :key="option.value"
                type="button"
                role="radio"
                class="choice"
                :class="{ selected: emblem === option.value }"
                :aria-checked="emblem === option.value"
                @click="pickEmblem(option.value)"
              >
                <BadgeEmblem v-if="option.badge" :badge="option.badge" size="md" :tooltip="false" />
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="emblemBadges.length" class="field">
            <span class="field-label">Avatar frame</span>
            <div class="choices frames" role="radiogroup" data-testid="frame-picker">
              <button
                v-for="option in frameOptions"
                :key="option.value ?? 'match'"
                type="button"
                role="radio"
                class="choice frame-choice"
                :class="{ selected: draft.frame === option.value }"
                :aria-checked="draft.frame === option.value"
                :data-testid="`frame-${option.value ?? 'match'}`"
                @click="draft.frame = option.value"
              >
                <UserAvatar
                  :src="picture"
                  :name="username"
                  :badge="option.badge"
                  :accent="draft.accent"
                  :size="34"
                />
                <span class="frame-label">{{ option.label }}</span>
              </button>
            </div>
          </div>
        </section>

        <!-- Title: About -->
        <section class="group">
          <h3 class="group-title">About</h3>

          <label class="field">
            <span class="field-label">Headline</span>
            <input
              v-model="draft.headline"
              type="text"
              class="form-control"
              maxlength="80"
              placeholder="Seasonal anime enjoyer"
              :disabled="isDemoUser"
            />
          </label>

          <label class="field">
            <span class="field-label"
              >Bio <small>{{ bio.length }}/300</small></span
            >
            <textarea
              v-model="bio"
              class="form-control"
              maxlength="300"
              rows="3"
              placeholder="Tell people what you like to watch"
              :disabled="isDemoUser"
            ></textarea>
            <small v-if="isDemoUser" class="field-note">
              The shared demo account's headline and bio can't change.
            </small>
          </label>

          <PreferencesEditor v-model:genres="genres" />
        </section>

        <!-- Title: Visibility -->
        <section class="group">
          <h3 class="group-title">Visibility</h3>

          <label class="toggle-row">
            <span>
              <strong>Public profile</strong>
              <small>Anyone with your link can view it.</small>
            </span>
            <input
              v-model="draft.isPublic"
              type="checkbox"
              class="switch"
              data-testid="toggle-public"
            />
          </label>

          <label class="toggle-row">
            <span>
              <strong>Show connected accounts</strong>
              <small>AniList, MyAnimeList, and TMDB links under your name.</small>
            </span>
            <input
              v-model="draft.showConnections"
              type="checkbox"
              class="switch"
              data-testid="toggle-connections"
            />
          </label>
        </section>

        <!-- Title: Tabs -->
        <section class="group">
          <h3 class="group-title">Tabs</h3>

          <ul class="tab-order">
            <li
              v-for="(tab, index) in draft.tabOrder"
              :key="tab"
              class="tab-order-row"
              :class="{ hidden: draft.hiddenTabs.includes(tab) }"
            >
              <span class="tab-order-name">{{ tabLabels[tab] }}</span>
              <label class="inline-check">
                <input
                  type="checkbox"
                  :checked="!draft.hiddenTabs.includes(tab)"
                  :disabled="!draft.hiddenTabs.includes(tab) && visibleTabs.length === 1"
                  @change="toggleTabVisibility(tab)"
                />
                Visible
              </label>
              <button
                type="button"
                class="icon-btn small"
                :disabled="index === 0"
                aria-label="Move up"
                @click="moveTab(index, -1)"
              >
                <span aria-hidden="true">&uarr;</span>
              </button>
              <button
                type="button"
                class="icon-btn small"
                :disabled="index === draft.tabOrder.length - 1"
                aria-label="Move down"
                @click="moveTab(index, 1)"
              >
                <span aria-hidden="true">&darr;</span>
              </button>
            </li>
          </ul>

          <label class="field inline-field">
            <span class="field-label">Open on</span>
            <select v-model="draft.defaultTab" class="form-control">
              <option v-for="tab in visibleTabs" :key="tab" :value="tab">
                {{ tabLabels[tab] }}
              </option>
            </select>
          </label>
        </section>
      </div>

      <footer class="panel-footer">
        <router-link to="/settings" class="settings-link">Account settings</router-link>
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary" :disabled="saving">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UserAvatar from '@/components/UserAvatar.vue'
import BadgeEmblem from '@/components/BadgeEmblem.vue'
import PreferencesEditor from '@/components/PreferencesEditor.vue'
import ProfilePictureEditor from '@/components/ProfilePictureEditor.vue'
import { NO_EMBLEM, type BadgeDef } from '@/utils/badges'
import { ACCENT_PRESETS, accentColor, isCustomAccent, readableOn } from '@/utils/accent'
import type { ProfileAccent, ProfileSettings, ProfileTab } from '@/types/profile'

export interface CustomizeResult {
  settings: ProfileSettings
  bio: string
  genres: string[]
  /** Badge next to the name: '' = automatic, a badge id, 'none', or null if not touched. */
  emblem: string | null
}

const props = defineProps<{
  settings: ProfileSettings
  bio: string
  genres: string[]
  /** Current pick for the badge next to the name ('' = automatic). */
  emblem: string
  /** Emblem badges the user holds, in registry order. */
  emblemBadges: BadgeDef[]
  username: string
  picture: string | null
  tabLabels: Record<ProfileTab, string>
  saving: boolean
  isDemoUser: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [result: CustomizeResult]
  picture: [profilePicture: string | null]
}>()

const draft = ref<ProfileSettings>({
  ...props.settings,
  tabOrder: [...props.settings.tabOrder],
  hiddenTabs: [...props.settings.hiddenTabs],
})
const bio = ref(props.bio)
const genres = ref([...props.genres])
const emblem = ref(props.emblem)
const emblemTouched = ref(false)
// The badges list may land after the panel opens; follow it until the user picks.
watch(
  () => props.emblem,
  (value) => {
    if (!emblemTouched.value) emblem.value = value
  },
)

const emblemOptions = computed(() => [
  { value: '', label: `Automatic`, badge: props.emblemBadges[0]?.id ?? null },
  ...props.emblemBadges.map((badge) => ({ value: badge.id, label: badge.label, badge: badge.id })),
  { value: NO_EMBLEM, label: 'None', badge: null },
])

/** The emblem the draft shows next to the name. */
const previewEmblem = computed(() => {
  if (emblem.value === NO_EMBLEM) return null
  return emblem.value || props.emblemBadges[0]?.id || null
})

const frameOptions = computed(() => [
  { value: null, label: 'Match badge', badge: previewEmblem.value },
  ...props.emblemBadges.map((badge) => ({ value: badge.id, label: badge.label, badge: badge.id })),
  { value: NO_EMBLEM, label: 'None', badge: null },
])

/** The frame the draft puts around the avatar. */
const previewFrame = computed(() => {
  const frame = draft.value.frame
  if (frame === NO_EMBLEM) return null
  if (frame && props.emblemBadges.some((badge) => badge.id === frame)) return frame
  return previewEmblem.value
})

/** The whole panel follows the accent being picked. */
const accentStyle = computed(() => ({
  '--profile-accent': accentColor(draft.value.accent),
  '--profile-on-accent': readableOn(draft.value.accent),
}))

const pickCustomAccent = (event: Event) => {
  draft.value.accent = (event.target as HTMLInputElement).value.toLowerCase() as ProfileAccent
}

const visibleTabs = computed(() =>
  draft.value.tabOrder.filter((tab) => !draft.value.hiddenTabs.includes(tab)),
)

const moveTab = (index: number, delta: number) => {
  const order = [...draft.value.tabOrder]
  const [tab] = order.splice(index, 1)
  order.splice(index + delta, 0, tab!)
  draft.value.tabOrder = order
}

const toggleTabVisibility = (tab: ProfileTab) => {
  const hidden = draft.value.hiddenTabs
  draft.value.hiddenTabs = hidden.includes(tab)
    ? hidden.filter((row) => row !== tab)
    : [...hidden, tab]
  if (!visibleTabs.value.includes(draft.value.defaultTab)) {
    draft.value.defaultTab = visibleTabs.value[0]!
  }
}

const pickEmblem = (value: string) => {
  emblem.value = value
  emblemTouched.value = true
}

const save = () =>
  emit('save', {
    settings: draft.value,
    bio: bio.value,
    genres: genres.value,
    emblem: emblemTouched.value ? emblem.value : null,
  })
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(21, 34, 56, 0.5);
  backdrop-filter: blur(2px);
}

.customize-panel {
  width: min(560px, 100%);
  max-height: calc(100vh - 2rem);
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.4rem;
  border-bottom: 1px solid var(--border-color);
}

.panel-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  color: var(--text-primary);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.2rem 1.4rem 1.4rem;
  display: grid;
  gap: 1.4rem;
}

/* Live preview of how the profile reads elsewhere. */
.preview {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1.3rem 1.1rem 1rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--profile-accent) 10%, var(--bg-primary));
  border: 1px solid color-mix(in srgb, var(--profile-accent) 25%, var(--border-color));
}

.preview-text {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.preview-name {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.preview-headline {
  color: var(--text-secondary);
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-text :deep(.picture-editor) {
  margin-top: 0.45rem;
}

.preview-text :deep(.btn) {
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
}

.group {
  display: grid;
  gap: 1rem;
}

.group + .group {
  padding-top: 1.4rem;
  border-top: 1px solid var(--border-color);
}

.group-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.field {
  display: grid;
  gap: 0.45rem;
}

.field-label {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.88rem;
}

.field-label small {
  color: var(--text-muted);
  font-weight: 500;
}

.field-note {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.form-control {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
}

textarea.form-control {
  resize: vertical;
}

/* The genre picker brings its own label and hint; keep them in step with the rest. */
.group :deep(.preferences-editor .field-label) {
  font-size: 0.88rem;
}

/* Accent swatches */
.swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.swatch {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.55);
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.15s ease;
}

.swatch.selected {
  outline-color: var(--text-primary);
}

/* Default: silver, like the avatar frame it leaves. */
.swatch-default {
  background: linear-gradient(135deg, #f8fafc, #cbd5e1 45%, #8b97a8 75%, #e2e8f0);
}

.swatch-wheel {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(
    #ff4d4d,
    #ffb84d,
    #f5f54d,
    #4dff88,
    #4dd8ff,
    #6d6dff,
    #d64dff,
    #ff4d4d
  );
  overflow: hidden;
}

.wheel-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  pointer-events: none;
}

/* The native picker covers the swatch invisibly so a click opens it. */
.wheel-input {
  position: absolute;
  inset: -4px;
  width: calc(100% + 8px);
  height: calc(100% + 8px);
  opacity: 0;
  cursor: pointer;
}

.custom-hex {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

/* Badge and frame choices */
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.choice {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.choice:hover {
  border-color: color-mix(in srgb, var(--profile-accent, var(--coral-primary)) 50%, transparent);
}

.choice.selected {
  border-color: var(--profile-accent, var(--coral-primary));
  background: color-mix(in srgb, var(--profile-accent, var(--coral-primary)) 12%, transparent);
  color: var(--text-primary);
}

.frames {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 0.5rem;
}

.frame-choice {
  flex-direction: column;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 1rem 0.4rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75rem;
  text-align: center;
}

/* Toggles: label on the left, switch on the right. */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  cursor: pointer;
}

.toggle-row span {
  display: grid;
  gap: 0.1rem;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.toggle-row small {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.switch {
  appearance: none;
  flex-shrink: 0;
  position: relative;
  width: 38px;
  height: 22px;
  margin: 0;
  border-radius: 999px;
  background: var(--border-color);
  cursor: pointer;
  transition: background 0.2s ease;
}

.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}

.switch:checked {
  background: var(--profile-accent, var(--coral-primary));
}

.switch:checked::after {
  transform: translateX(16px);
}

.switch:focus-visible {
  outline: 2px solid var(--profile-accent, var(--coral-primary));
  outline-offset: 2px;
}

/* Tabs */
.tab-order {
  display: grid;
  gap: 0.35rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.tab-order-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.4rem 0.4rem 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-primary);
}

.tab-order-row.hidden .tab-order-name {
  color: var(--text-muted);
}

.tab-order-name {
  flex: 1;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.inline-check {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.inline-field {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.8rem;
}

.icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.icon-btn.small {
  width: 28px;
  height: 28px;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.panel-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.9rem 1.4rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-card);
}

.settings-link {
  margin-right: auto;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

@media (max-width: 480px) {
  .preview {
    flex-direction: column;
    text-align: center;
  }

  .preview-name {
    justify-content: center;
  }

  .preview-text :deep(.picture-editor),
  .preview-text :deep(.upload-controls) {
    justify-content: center;
  }
}
</style>
