<!--
  TitleExtras.vue — trailer, tags, and key staff for a title (component).

  Used on movie, series, and season pages. The trailer plays right on the page: a
  thumbnail until clicked, then YouTube's privacy-mode player streams it in place; spoiler tags stay hidden until revealed; staff open their
  person page; episode credits show on each episode instead. `sections` picks which
  parts this instance shows, so a page can place them apart.
-->
<template>
  <div v-if="hasAny" class="title-extras" data-testid="title-extras">
    <!-- Title: Trailer -->
    <DetailSection v-if="trailerKey" name="trailer" title="Trailer">
      <div class="trailer-frame">
        <iframe
          v-if="trailerOpen"
          :src="`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0`"
          title="Trailer"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
        ></iframe>
        <button
          v-else
          type="button"
          class="trailer-poster"
          data-testid="play-trailer"
          aria-label="Play trailer"
          @click="trailerOpen = true"
        >
          <img
            :src="`https://i.ytimg.com/vi/${trailerKey}/hqdefault.jpg`"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <span class="trailer-play" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" /></svg>
          </span>
        </button>
      </div>
    </DetailSection>

    <!-- Title: Tags -->
    <DetailSection v-if="tags.length" name="tags" title="Tags">
      <div class="chips">
        <span
          v-for="tag in visibleTags"
          :key="tag.name"
          class="chip"
          :class="{ spoiler: tag.isSpoiler }"
          :title="tag.category"
        >
          {{ tag.name }}
          <small v-if="tag.rank">{{ tag.rank }}%</small>
        </span>
        <button
          v-if="spoilerCount && !showSpoilers"
          type="button"
          class="chip toggle"
          data-testid="show-spoiler-tags"
          @click="showSpoilers = true"
        >
          Show {{ spoilerCount }} spoiler tag{{ spoilerCount > 1 ? 's' : '' }}
        </button>
      </div>
    </DetailSection>

    <!-- Title: Staff -->
    <DetailSection v-if="staffByPerson.length" name="staff" title="Staff">
      <div class="staff-list">
        <router-link
          v-for="person in staffByPerson"
          :key="person._id"
          :to="detailPath('/staff', person._id, person.name)"
          class="staff-card"
          :data-testid="`staff-${person._id}`"
        >
          <img
            v-if="person.imagePath"
            :src="getProfileUrl(person.imagePath)"
            :alt="person.name"
            @error="hideBrokenImage"
          />
          <div v-else class="no-photo"><i class="fas fa-user"></i></div>
          <div>
            <p class="staff-name">{{ person.name }}</p>
            <p class="staff-role">{{ person.roles.join(', ') }}</p>
          </div>
        </router-link>
      </div>
    </DetailSection>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UnifiedContent } from '@/types/content'
import { getProfileUrl } from '@/services/api'
import { detailPath } from '@/utils/slug'
import { hideBrokenImage } from '@/utils/posters'
import DetailSection from '@/components/DetailSection.vue'

type Section = 'trailer' | 'tags' | 'staff'

const props = withDefaults(
  defineProps<{
    content: Pick<UnifiedContent, '_id' | 'trailer' | 'tags' | 'staff'>
    sections?: Section[]
  }>(),
  { sections: () => ['trailer', 'tags', 'staff'] },
)

const shows = (section: Section) => props.sections.includes(section)

const trailerOpen = ref(false)
const showSpoilers = ref(false)

watch(
  () => props.content._id,
  () => {
    trailerOpen.value = false
    showSpoilers.value = false
  },
)

const trailerKey = computed(() =>
  shows('trailer') && props.content.trailer?.site === 'youtube' ? props.content.trailer.key : '',
)
const tags = computed(() => (shows('tags') && props.content.tags) || [])
const spoilerCount = computed(() => tags.value.filter((tag) => tag.isSpoiler).length)
const visibleTags = computed(() =>
  showSpoilers.value ? tags.value : tags.value.filter((tag) => !tag.isSpoiler),
)
/** One card per person, with every role they had. */
const staffByPerson = computed(() => {
  const people = new Map<
    string,
    { _id: string; name: string; imagePath?: string; roles: string[] }
  >()
  for (const credit of (shows('staff') && props.content.staff) || []) {
    const person = people.get(credit._id)
    if (person) person.roles.push(credit.role)
    else people.set(credit._id, { ...credit, roles: [credit.role] })
  }
  return [...people.values()]
})
const hasAny = computed(
  () => Boolean(trailerKey.value) || tags.value.length > 0 || staffByPerson.value.length > 0,
)
</script>

<style scoped>
.trailer-frame {
  position: relative;
  width: 100%;
  max-width: 720px;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.trailer-frame iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.trailer-poster {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: #000;
  cursor: pointer;
}

.trailer-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.85;
  transition: opacity 0.2s ease;
}

.trailer-poster:hover img {
  opacity: 1;
}

.trailer-play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: var(--coral-primary);
  color: #fff;
  transform: translate(-50%, -50%);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  transition: transform 0.2s ease;
}

.trailer-play svg {
  width: 30px;
  height: 30px;
  margin-left: 4px;
}

.trailer-poster:hover .trailer-play {
  transform: translate(-50%, -50%) scale(1.08);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.8rem;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  text-decoration: none;
}

.chip small {
  color: var(--text-muted);
  font-size: 0.75rem;
}

.chip.spoiler {
  border-color: var(--coral-primary);
  border-style: dashed;
}

.chip.toggle {
  cursor: pointer;
}

.chip.toggle {
  color: var(--text-muted);
}

.chip.toggle:hover {
  border-color: var(--coral-primary);
}

.staff-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}

.staff-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  text-decoration: none;
  min-width: 0;
}

.staff-card:hover {
  border-color: var(--coral-primary);
}

.staff-card img,
.staff-card .no-photo {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.staff-card .no-photo {
  display: grid;
  place-items: center;
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.staff-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.staff-role {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
