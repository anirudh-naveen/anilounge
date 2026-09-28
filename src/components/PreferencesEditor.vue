<!--
  PreferencesEditor.vue — favorite genres picker (component).

  Used in the profile Customize panel. Edits `genres` through v-model; the
  parent saves them with the rest of the profile. Studios are not typed in
  here: they are favorited as catalog content from each studio's page.
-->
<template>
  <div class="preferences-editor">
    <!-- Title: Favorite Genres -->
    <div class="field">
      <span class="field-label">Favorite genres</span>
      <div class="genre-selection">
        <button
          v-for="genre in FAVORITE_GENRE_OPTIONS"
          :key="genre"
          type="button"
          class="genre-option"
          :class="{ selected: genres.includes(genre) }"
          :aria-pressed="genres.includes(genre)"
          @click="toggleGenre(genre)"
        >
          {{ genre }}
        </button>
      </div>
    </div>

    <p class="studio-hint">
      To favorite a studio, open its page and choose Add to Favorites. Favorited studios show on
      your profile.
    </p>
  </div>
</template>

<script setup lang="ts">
const FAVORITE_GENRE_OPTIONS = [
  'Action',
  'Adventure',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western',
  'Biography',
  'Film Noir',
  'Musical',
  'Sport',
  'Superhero',
  'Supernatural',
  'Psychological',
  'Slice of Life',
  'Mecha',
  'School',
  'Ecchi',
  'Harem',
  'Josei',
  'Seinen',
  'Shoujo',
  'Shounen',
  'Isekai',
  'Martial Arts',
  'Military',
  'Police',
  'Samurai',
  'Space',
  'Vampire',
  'Zombie',
]

const genres = defineModel<string[]>('genres', { required: true })

const toggleGenre = (genre: string) => {
  genres.value = genres.value.includes(genre)
    ? genres.value.filter((row) => row !== genre)
    : [...genres.value, genre]
}
</script>

<style scoped>
.preferences-editor {
  display: grid;
  gap: 1.1rem;
}

.field {
  display: grid;
  gap: 0.5rem;
}

.field-label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.genre-selection {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  max-height: 180px;
  overflow-y: auto;
  padding: 0.1rem;
}

.genre-option {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-muted);
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
}

.genre-option.selected {
  background: var(--profile-accent, var(--coral-primary));
  border-color: var(--profile-accent, var(--coral-primary));
  color: #fff;
}

.studio-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
