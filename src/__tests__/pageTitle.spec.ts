import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { usePageMeta, usePageTitle } from '@/composables/usePageMeta'

const page = (setup: () => void) =>
  defineComponent({
    setup() {
      setup()
      return () => h('div')
    },
  })

describe('usePageTitle', () => {
  it('sets "Title · AniLounge" and clears the previous page meta', async () => {
    document.title = 'AniLounge'
    const forum = mount(page(() => usePageMeta({ title: 'Forum', path: '/forum' })))
    await nextTick()
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull()

    // The next page sets up before the previous one unmounts, as in the router.
    const watchlist = mount(page(() => usePageTitle('Watchlist')))
    forum.unmount()
    await nextTick()
    expect(document.title).toBe('Watchlist · AniLounge')
    expect(document.querySelector('link[rel="canonical"]')).toBeNull()

    watchlist.unmount()
    expect(document.title).toBe('AniLounge')
  })
})
