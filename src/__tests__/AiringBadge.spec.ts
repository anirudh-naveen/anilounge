import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AiringBadge from '@/components/AiringBadge.vue'

describe('AiringBadge', () => {
  it('shows the Airing overlay for currently airing TV', () => {
    const wrapper = mount(AiringBadge, {
      props: {
        content: { contentType: 'tv', malStatus: 'currently_airing' },
        variant: 'card',
      },
    })

    expect(wrapper.text()).toContain('Airing')
    expect(wrapper.classes()).not.toContain('upcoming')
  })

  it('shows the Upcoming overlay for unreleased movies and TV', () => {
    const from = '2099-01-01'
    const movie = mount(AiringBadge, {
      props: {
        content: { contentType: 'movie', releaseDate: from },
        variant: 'card',
      },
    })
    const show = mount(AiringBadge, {
      props: {
        content: { contentType: 'tv', malStatus: 'not_yet_aired', releaseDate: from },
        variant: 'card',
      },
    })

    expect(movie.text()).toBe('Upcoming')
    expect(movie.classes()).toContain('upcoming')
    expect(show.text()).toBe('Upcoming')
    expect(show.classes()).toContain('upcoming')
  })

  it('prefers Airing over Upcoming when a show is currently airing', () => {
    const wrapper = mount(AiringBadge, {
      props: {
        content: {
          contentType: 'tv',
          malStatus: 'currently_airing',
          releaseDate: '2026-10-01',
        },
        variant: 'card',
      },
    })

    expect(wrapper.text()).toContain('Airing')
    expect(wrapper.classes()).not.toContain('upcoming')
  })

  it('hides when the title is already released', () => {
    const wrapper = mount(AiringBadge, {
      props: {
        content: { contentType: 'movie', releaseDate: '2020-01-01' },
        variant: 'card',
      },
    })

    expect(wrapper.find('.airing-badge').exists()).toBe(false)
  })
})
