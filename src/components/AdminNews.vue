<!--
  AdminNews.vue — the admin page's News tab (admins only, not developers).

  Write site news with the forum's formatting (RichTextEditor) plus pictures: the
  picture button uploads one and inserts a `![caption](url)` line. Posting puts the
  news in every inbox, signed by Lounge Keeper. Below, the news still showing in
  inboxes, with read counts and a delete button.
-->
<template>
  <section class="social-panel news-panel" data-testid="admin-news">
    <form class="news-form" @submit.prevent="post">
      <div class="news-from">
        <UserAvatar :src="KEEPER_PICTURE" name="Lounge Keeper" :size="36" />
        <p class="social-meta">
          Posts to every inbox as <strong>Lounge Keeper</strong>. Everyone sees it for
          {{ NEWS_DAYS }} days.
        </p>
      </div>

      <label class="field">
        <span class="field-label">
          Title
          <span class="social-char-count">{{ title.length }}/{{ TITLE_MAX }}</span>
        </span>
        <input
          v-model="title"
          class="input"
          :maxlength="TITLE_MAX"
          placeholder="What's new?"
          required
          data-testid="news-title"
        />
      </label>

      <div class="field">
        <span class="field-label">
          Message
          <span class="social-char-count" :class="{ over: body.length >= BODY_MAX }"
            >{{ body.length }}/{{ BODY_MAX }}</span
          >
        </span>
        <RichTextEditor
          ref="editor"
          v-model="body"
          :maxlength="BODY_MAX"
          label="News message"
          placeholder="Write the news. Format it like a forum post; the picture button adds images."
          testid="news"
          images
          required
        >
          <template #tools="{ previewing }">
            <button
              type="button"
              class="format-btn"
              title="Add a picture (JPG, PNG, GIF, or WebP, up to 5 MB)"
              aria-label="Add a picture"
              :disabled="previewing || uploading"
              data-testid="news-image"
              @mousedown.prevent
              @click="fileInput?.click()"
            >
              <span v-if="uploading">…</span>
              <svg v-else class="format-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2.5" />
                <circle cx="8.5" cy="9.5" r="1.6" />
                <path d="m4 18 5.5-5.5 4 4L16 14l4 4" />
              </svg>
            </button>
          </template>
        </RichTextEditor>
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          class="news-file"
          data-testid="news-image-input"
          @change="upload"
        />
      </div>

      <div class="news-actions">
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="posting || !title.trim() || !body.trim()"
          data-testid="news-post"
        >
          {{ posting ? 'Posting…' : 'Post to inboxes' }}
        </button>
      </div>
    </form>

    <!-- Title: Recent News -->
    <div class="news-recent">
      <h3 class="news-heading">In Inboxes Now</h3>
      <div v-if="loading" class="social-loading"><div class="spinner"></div></div>
      <p v-else-if="!recent.length" class="social-empty">
        No news in the last {{ NEWS_DAYS }} days.
      </p>
      <ul v-else class="news-list">
        <li v-for="item in recent" :key="item.id" class="news-item" data-testid="news-item">
          <div class="news-item-head">
            <strong>{{ item.title }}</strong>
            <span class="social-meta">
              {{ new Date(item.createdAt).toLocaleDateString() }} · {{ item.reads }} read
            </span>
            <button
              type="button"
              class="btn btn-ghost btn-small"
              :disabled="deleting === item.id"
              @click="remove(item)"
            >
              Delete
            </button>
          </div>
          <details>
            <summary class="social-meta">Show message</summary>
            <ForumRichText :text="item.body" images class="news-item-body" />
          </details>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useToast } from 'vue-toastification'
import ForumRichText from '@/components/ForumRichText.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { adminAPI } from '@/services/api'
import { apiErrorMessage } from '@/utils/social'

interface NewsItem {
  id: string
  title: string
  body: string
  createdAt: string
  reads: number
}

/** Same limits and lifetime as the server (services/inboxService.js). */
const TITLE_MAX = 200
const BODY_MAX = 20000
const NEWS_DAYS = 180
const KEEPER_PICTURE = 'https://www.anilounge.net/anilounge-logo.png'

const toast = useToast()
const title = ref('')
const body = ref('')
const posting = ref(false)
const uploading = ref(false)
const loading = ref(true)
const deleting = ref<string | null>(null)
const recent = ref<NewsItem[]>([])
const editor = ref<InstanceType<typeof RichTextEditor> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const load = async () => {
  loading.value = true
  try {
    const response = await adminAPI.listNews()
    recent.value = response.data.data as NewsItem[]
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not load news.'))
  } finally {
    loading.value = false
  }
}

/** Upload the chosen picture and insert it at the cursor, captioned with its file name. */
const upload = async () => {
  const file = fileInput.value?.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('image', file)
    const response = await adminAPI.uploadNewsImage(form)
    const caption = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[[\]]/g, '')
      .slice(0, 80)
    editor.value?.insertBlock(`![${caption}](${response.data.data.url})`)
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not upload that picture.'))
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

const post = async () => {
  if (!window.confirm(`Post "${title.value.trim()}" to every inbox?`)) return
  posting.value = true
  try {
    await adminAPI.postNews({ title: title.value, body: body.value })
    toast.success('News posted to every inbox.')
    title.value = ''
    body.value = ''
    await load()
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not post the news.'))
  } finally {
    posting.value = false
  }
}

const remove = async (item: NewsItem) => {
  if (!window.confirm(`Delete "${item.title}" from every inbox?`)) return
  deleting.value = item.id
  try {
    await adminAPI.deleteNews(item.id)
    recent.value = recent.value.filter((other) => other.id !== item.id)
    toast.success('News deleted.')
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not delete the news.'))
  } finally {
    deleting.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.news-panel {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.news-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.news-from {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.news-from p {
  margin: 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.field-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  font-weight: 600;
  color: var(--text-primary);
}

.format-icon {
  width: 1.05rem;
  height: 1.05rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.news-file {
  display: none;
}

.news-actions {
  display: flex;
  justify-content: flex-end;
}

.news-heading {
  margin: 0 0 0.75rem;
  font-family: var(--font-display);
  font-size: 1.1rem;
}

.news-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.news-item {
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
}

.news-item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.news-item-head strong {
  flex: 1;
  min-width: 10rem;
}

.news-item details summary {
  margin-top: 0.4rem;
  cursor: pointer;
}

.news-item-body {
  margin-top: 0.6rem;
}
</style>
