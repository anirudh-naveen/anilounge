<!--
  ForumRichText.vue — a formatted forum post body (component).

  Renders the marks described in `utils/richText.ts` (bold, italics, strikethrough,
  links, one heading size, lists, and quotes) as Vue nodes, so user text is never
  parsed as HTML. Links open in a new tab and are marked `nofollow ugc`.
-->
<script setup lang="ts">
import { computed, h, type VNode } from 'vue'
import { parseRichText, type Block, type Inline } from '@/utils/richText'

const props = defineProps<{ text: string }>()

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

const renderBlock = (block: Block) => {
  switch (block.type) {
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

const blocks = computed(() => parseRichText(props.text))

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

.rich-text :deep(a) {
  color: var(--coral-deep);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
