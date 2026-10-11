<!--
  RichTextEditor.vue — textarea with the forum formatting toolbar and a preview (component).

  Shared by the forum composer and the admin news editor. The buttons insert the marks
  described in `utils/richText.ts` around the selection (Ctrl/⌘+B and +I too), and the
  Preview tab renders the text with `ForumRichText`. The `tools` slot adds buttons
  after the built-in ones; `insertBlock` (exposed) puts text on its own line at the
  cursor, e.g. an uploaded picture. `images` lets `![caption](url)` lines render.
-->
<template>
  <div class="rich-editor">
    <!-- Title: Formatting -->
    <span class="format-bar" role="toolbar" aria-label="Formatting">
      <span class="format-tools">
        <button
          v-for="tool in FORMAT_TOOLS"
          :key="tool.id"
          type="button"
          class="format-btn"
          :class="`format-${tool.id}`"
          :title="tool.title"
          :aria-label="tool.title"
          :disabled="previewing"
          :data-testid="`format-${tool.id}`"
          @mousedown.prevent
          @click="applyFormat(tool.id)"
        >
          {{ tool.glyph }}
        </button>
        <slot name="tools" :previewing="previewing" />
      </span>
      <span class="format-modes" role="tablist" aria-label="Editor view">
        <button
          type="button"
          role="tab"
          class="format-mode"
          :aria-selected="!previewing"
          @click="previewing = false"
        >
          Write
        </button>
        <button
          type="button"
          role="tab"
          class="format-mode"
          :aria-selected="previewing"
          :data-testid="`${testid}-preview-tab`"
          @click="previewing = true"
        >
          Preview
        </button>
      </span>
    </span>
    <div
      v-if="previewing"
      class="input rich-editor-body rich-editor-preview"
      :data-testid="`${testid}-preview`"
    >
      <ForumRichText v-if="modelValue.trim()" :text="modelValue" :images="images" />
      <p v-else class="social-meta">Nothing to preview yet.</p>
    </div>
    <textarea
      v-show="!previewing"
      ref="input"
      :value="modelValue"
      class="input social-textarea rich-editor-body"
      :rows="rows"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :data-testid="`${testid}-body`"
      :required="required"
      :aria-label="label"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @keydown="onKeydown"
    ></textarea>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useToast } from 'vue-toastification'
import ForumRichText from '@/components/ForumRichText.vue'
import { applyFormatting, type FormatTool } from '@/utils/richTextEditing'

const props = withDefaults(
  defineProps<{
    modelValue: string
    maxlength: number
    placeholder?: string
    /** Accessible name of the textarea. */
    label: string
    rows?: number
    /** data-testid prefix: `<testid>-body`, `-preview`, `-preview-tab`. */
    testid?: string
    required?: boolean
    /** Render `![caption](url)` picture lines in the preview. */
    images?: boolean
  }>(),
  { placeholder: '', rows: 8, testid: 'composer', required: false, images: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const toast = useToast()
const previewing = ref(false)
const input = ref<HTMLTextAreaElement | null>(null)

const FORMAT_TOOLS: { id: FormatTool; glyph: string; title: string }[] = [
  { id: 'bold', glyph: 'B', title: 'Bold (Ctrl/⌘+B)' },
  { id: 'italic', glyph: 'I', title: 'Italic (Ctrl/⌘+I)' },
  { id: 'strike', glyph: 'S', title: 'Strikethrough' },
  { id: 'heading', glyph: 'H', title: 'Heading' },
  { id: 'bullets', glyph: '•', title: 'Bulleted list' },
  { id: 'numbers', glyph: '1.', title: 'Numbered list' },
  { id: 'quote', glyph: '❝', title: 'Quote' },
  { id: 'section', glyph: '▸', title: 'Collapsible section (+++ Title … +++)' },
  { id: 'callout', glyph: '▤', title: 'Callout box (::: note, tip, or warning … :::)' },
  { id: 'link', glyph: '🔗', title: 'Link' },
]

const tooLong = () => toast.info(`This can be up to ${props.maxlength} characters.`)

/** Replace the text and select a range, keeping focus in the textarea. */
const setText = async (text: string, start: number, end: number) => {
  emit('update:modelValue', text)
  await nextTick()
  input.value?.focus()
  input.value?.setSelectionRange(start, end)
}

/** Format the selected text (or insert a placeholder), keeping the result selected. */
const applyFormat = (tool: FormatTool) => {
  const el = input.value
  if (!el) return
  const result = applyFormatting(props.modelValue, el.selectionStart, el.selectionEnd, tool)
  if (result.text.length > props.maxlength) return tooLong()
  setText(result.text, result.selectionStart, result.selectionEnd)
}

const onKeydown = (event: KeyboardEvent) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
  const key = event.key.toLowerCase()
  if (key !== 'b' && key !== 'i') return
  event.preventDefault()
  applyFormat(key === 'b' ? 'bold' : 'italic')
}

/** Put `block` on its own line at the cursor (or at the end). */
const insertBlock = (block: string) => {
  const text = props.modelValue
  const at = input.value && !previewing.value ? input.value.selectionEnd : text.length
  const before = text.slice(0, at)
  const after = text.slice(at)
  const lead = before && !before.endsWith('\n') ? '\n' : ''
  const trail = after && !after.startsWith('\n') ? '\n' : ''
  const next = `${before}${lead}${block}${trail}${after}`
  if (next.length > props.maxlength) return tooLong()
  previewing.value = false
  const end = before.length + lead.length + block.length
  setText(next, end, end)
}

defineExpose({ insertBlock })
</script>

<style scoped>
.rich-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rich-editor-body {
  min-height: 10rem;
}

.format-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.format-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.format-btn,
.format-tools :slotted(.format-btn) {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.45rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
}

.format-btn:hover:not(:disabled),
.format-tools :slotted(.format-btn:hover:not(:disabled)) {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.format-btn:disabled,
.format-tools :slotted(.format-btn:disabled) {
  opacity: 0.45;
  cursor: not-allowed;
}

.format-bold {
  font-weight: 800;
}

.format-italic {
  font-style: italic;
  font-family: var(--font-display);
}

.format-strike {
  text-decoration: line-through;
}

.format-heading {
  font-family: var(--font-display);
  font-weight: 700;
}

.format-modes {
  display: flex;
  gap: 0.2rem;
}

.format-mode {
  padding: 0.3rem 0.75rem;
  border: 0;
  border-radius: 999px;
  background: none;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.format-mode[aria-selected='true'] {
  background: color-mix(in srgb, var(--coral-primary) 14%, transparent);
  color: var(--coral-deep);
}

.rich-editor-preview {
  overflow-y: auto;
  max-height: 32rem;
}
</style>
