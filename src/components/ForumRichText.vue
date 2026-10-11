<!--
  ForumRichText.vue — a formatted forum post body (component).

  Renders the marks described in `utils/richText.ts` (bold, italics, strikethrough,
  links, one heading size, lists, quotes, collapsible sections, and callout boxes)
  as Vue nodes, so user text is never parsed as HTML. Links open in a new tab and
  are marked `nofollow ugc`. With `images` (site news only), picture lines render
  as captioned images.
-->
<script setup lang="ts">
import { computed, h, type VNode } from 'vue'
import { parseRichText, type Block, type CalloutTone, type Inline } from '@/utils/richText'
import { API_HOST } from '@/services/api'

const props = defineProps<{ text: string; images?: boolean }>()

/** Uploaded news pictures are served by the API. */
const imageUrl = (src: string) => (src.startsWith('/') ? `${API_HOST}${src}` : src)

const INLINE_TAGS = { bold: 'strong', italic: 'em', strike: 's' } as const

const renderInline = (nodes: Inline[]): (VNode | string)[] =>
  nodes.map((node) => {
    switch (node.type) {
      case 'text':
        return node.text
      case 'break':
        return h('br')
      case 'link':
        return h(
          'a',
          { href: node.href, target: '_blank', rel: 'noopener noreferrer nofollow ugc' },
          renderInline(node.children),
        )
      default:
        return h(INLINE_TAGS[node.type], renderInline(node.children))
    }
  })

const CALLOUT_LABELS: Record<CalloutTone, { icon: string; label: string }> = {
  note: { icon: 'i', label: 'Note' },
  tip: { icon: '✦', label: 'Tip' },
  warning: { icon: '!', label: 'Heads up' },
}

const renderBlock = (block: Block): VNode => {
  switch (block.type) {
    case 'section':
      return h('details', { class: 'rich-section' }, [
        h('summary', { class: 'rich-section-summary' }, [
          h('span', { class: 'rich-section-chevron', 'aria-hidden': 'true' }),
          h('span', renderInline(block.summary)),
        ]),
        block.blocks.length
          ? h('div', { class: 'rich-section-body' }, block.blocks.map(renderBlock))
          : null,
      ])
    case 'callout': {
      const { icon, label } = CALLOUT_LABELS[block.tone]
      return h('aside', { class: ['rich-callout', `rich-callout-${block.tone}`] }, [
        h('p', { class: 'rich-callout-title' }, [
          h('span', { class: 'rich-callout-icon', 'aria-hidden': 'true' }, icon),
          h('span', block.title.length ? renderInline(block.title) : label),
        ]),
        ...block.blocks.map(renderBlock),
      ])
    }
    case 'image':
      return h('figure', { class: 'rich-image' }, [
        h('img', { src: imageUrl(block.src), alt: block.alt, loading: 'lazy' }),
        block.alt ? h('figcaption', block.alt) : null,
      ])
    case 'heading':
      return h('h2', { class: 'rich-heading' }, renderInline(block.children))
    case 'quote':
      return h('blockquote', renderInline(block.children))
    case 'list':
      return h(
        block.ordered ? 'ol' : 'ul',
        block.items.map((item) => h('li', renderInline(item))),
      )
    default:
      return h('p', renderInline(block.children))
  }
}

const blocks = computed(() => parseRichText(props.text, { images: props.images }))

const Blocks = () => blocks.value.map(renderBlock)
</script>

<template>
  <div class="rich-text"><Blocks /></div>
</template>

<style scoped>
.rich-text {
  color: var(--text-primary);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.rich-text > :deep(* + *) {
  margin-top: 0.85rem;
}

.rich-text :deep(.rich-heading) {
  margin-top: 1.4rem;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.rich-text :deep(.rich-heading:first-child) {
  margin-top: 0;
}

.rich-text :deep(ul),
.rich-text :deep(ol) {
  padding-left: 1.4rem;
}

.rich-text :deep(li + li) {
  margin-top: 0.25rem;
}

.rich-text :deep(blockquote) {
  padding: 0.35rem 0 0.35rem 0.9rem;
  border-left: 3px solid var(--coral-primary);
  color: var(--text-secondary);
}

.rich-text :deep(.rich-section-body > * + *),
.rich-text :deep(.rich-callout > * + *) {
  margin-top: 0.7rem;
}

/* Title: Picture (site news) */
.rich-text :deep(.rich-image) {
  margin-left: 0;
  margin-right: 0;
}

.rich-text :deep(.rich-image img) {
  display: block;
  max-width: 100%;
  max-height: 28rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.rich-text :deep(.rich-image figcaption) {
  margin-top: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Title: Collapsible section */
.rich-text :deep(.rich-section) {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.rich-text :deep(.rich-section[open]) {
  border-color: color-mix(in srgb, var(--teal-primary) 45%, var(--border-color));
}

.rich-text :deep(.rich-section-summary) {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 0.95rem;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  user-select: none;
  transition: background-color 0.2s ease;
}

.rich-text :deep(.rich-section-summary::-webkit-details-marker) {
  display: none;
}

.rich-text :deep(.rich-section-summary:hover) {
  background: var(--bg-hover);
}

.rich-text :deep(.rich-section-chevron) {
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-right: 2px solid var(--teal-primary);
  border-bottom: 2px solid var(--teal-primary);
  transform: rotate(-45deg);
  transition: transform 0.2s ease;
}

.rich-text :deep(.rich-section[open] .rich-section-chevron) {
  transform: rotate(45deg);
}

.rich-text :deep(.rich-section-body) {
  padding: 0.8rem 0.95rem 0.9rem;
  border-top: 1px solid var(--border-color);
}

.rich-text :deep(.rich-section[open] .rich-section-body) {
  animation: rich-section-in 0.22s ease;
}

@keyframes rich-section-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

/* Title: Callout box */
.rich-text :deep(.rich-callout) {
  --callout: var(--teal-primary);
  padding: 0.8rem 1rem;
  border: 1px solid color-mix(in srgb, var(--callout) 35%, transparent);
  border-left: 4px solid var(--callout);
  border-radius: 10px;
  background: color-mix(in srgb, var(--callout) 9%, transparent);
}

.rich-text :deep(.rich-callout-tip) {
  --callout: var(--gold-accent);
}

.rich-text :deep(.rich-callout-warning) {
  --callout: var(--coral-primary);
}

.rich-text :deep(.rich-callout-title) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 650;
}

.rich-text :deep(.rich-callout-icon) {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--callout);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .rich-text :deep(.rich-section[open] .rich-section-body) {
    animation: none;
  }

  .rich-text :deep(.rich-section-chevron) {
    transition: none;
  }
}

.rich-text :deep(a) {
  color: var(--coral-deep);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
