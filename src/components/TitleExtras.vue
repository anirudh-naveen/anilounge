<!--
  TitleExtras.vue — trailer, tags, and key staff for a title (component).

  Used on movie, series, and season pages. The trailer loads only when asked (no
  YouTube request until then); spoiler tags stay hidden until revealed; staff open their
  person page. `sections` picks which parts this instance shows, so a page can place
  them apart.
-->
<template>
  <div v-if="hasAny" class="title-extras" data-testid="title-extras">
    <!-- Title: Trailer -->
    <section v-if="trailerKey" class="extras-section">
      <h3>Trailer</h3>
      <div v-if="trailerOpen" class="trailer-frame">
        <iframe
          :src="`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1`"
          title="Trailer"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
      <button
        v-else
        type="button"
        class="trailer-button"
        data-testid="play-trailer"
        @click="trailerOpen = true"
      >
        <i class="fas fa-play"></i> Watch trailer
      </button>
    </section>

    <!-- Title: Tags -->
    <section v-if="tags.length" class="extras-section">
      <h3>Tags</h3>
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
    </section>

    <!-- Title: Staff -->
    <section v-if="staffByPerson.length || episodeStaff.length" class="extras-section">
      <h3>Staff</h3>
      <div v-if="staffByPerson.length" class="staff-list">
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
      <template v-if="episodeStaff.length">
        <h4 class="staff-subheading">Episode staff</h4>
        <div class="staff-list" data-testid="episode-staff-list">
          <router-link
            v-for="person in episodeStaff"
            :key="`${person._id}-${person.role}`"
            :to="detailPath('/staff', person._id, person.name)"
            class="staff-card"
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
              <p class="staff-role">
                {{ person.role }} · {{ person.episodes }} episode{{
                  person.episodes === 1 ? '' : 's'
                }}
              </p>
            </div>
          </router-link>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { UnifiedContent } from '@/types/content'
import { getProfileUrl } from '@/services/api'
import { detailPath } from '@/utils/slug'
import { hideBrokenImage } from '@/utils/posters'

type Section = 'trailer' | 'tags' | 'staff'

const props = withDefaults(
  defineProps<{
    content: Pick<UnifiedContent, '_id' | 'trailer' | 'tags' | 'staff' | 'episodeStaff'>
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
const episodeStaff = computed(() => (shows('staff') && props.content.episodeStaff) || [])
const hasAny = computed(
  () =>
    Boolean(trailerKey.value) ||
    tags.value.length > 0 ||
    staffByPerson.value.length > 0 ||
    episodeStaff.value.length > 0,
)
</script>

<style scoped>
.title-extras {
  display: grid;
  gap: 1.75rem;
  margin-bottom: 2rem;
}

.extras-section h3 {
  font-size: 1.2rem;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

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

.trailer-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.1rem;
  border-radius: 999px;
  border: 1px solid var(--coral-primary);
  background: transparent;
  color: var(--coral-primary);
  font: inherit;
  cursor: pointer;
}

.trailer-button:hover {
  background: var(--coral-primary);
  color: var(--bg-primary);
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

.staff-subheading {
  margin: 1rem 0 0.6rem;
  font-size: 1rem;
  color: var(--text-muted);
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
