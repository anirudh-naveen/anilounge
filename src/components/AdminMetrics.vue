<!--
  AdminMetrics.vue — the admin page's Metrics tab.

  Users (total, new, active), page views, unique visitors, and clicks for a chosen
  range, a daily bar chart, and the top pages, clicks, and referrers. Data comes from
  `GET /api/admin/metrics`; the app records it through src/services/metrics.ts.
-->
<template>
  <section class="social-panel" data-testid="admin-metrics">
    <div class="metrics-head">
      <div class="kind-tabs compact" role="tablist" aria-label="Date range">
        <button
          v-for="option in RANGES"
          :key="option"
          type="button"
          role="tab"
          class="kind-tab"
          :class="{ active: days === option }"
          :aria-selected="days === option"
          @click="days = option"
        >
          {{ option }} days
        </button>
      </div>
      <button type="button" class="kind-tab" :disabled="loading" @click="load">Refresh</button>
    </div>

    <div v-if="loading && !data" class="social-loading"><div class="spinner"></div></div>
    <p v-else-if="error" class="social-empty admin-error">{{ error }}</p>
    <template v-else-if="data">
      <div class="metrics-tiles">
        <div v-for="tile in tiles" :key="tile.label" class="metrics-tile">
          <span class="metrics-tile-label">{{ tile.label }}</span>
          <span class="metrics-tile-value">{{ format(tile.value) }}</span>
          <span v-if="tile.note" class="metrics-tile-note">{{ tile.note }}</span>
        </div>
      </div>

      <div class="metrics-chart-card">
        <div class="metrics-chart-head">
          <h3 class="metrics-heading">Per day</h3>
          <div class="kind-tabs compact" role="tablist" aria-label="Chart series">
            <button
              v-for="option in SERIES"
              :key="option.id"
              type="button"
              role="tab"
              class="kind-tab"
              :class="{ active: series === option.id }"
              :aria-selected="series === option.id"
              @click="series = option.id"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <div class="metrics-chart" role="img" :aria-label="chartLabel">
          <div
            v-for="point in data.series"
            :key="point.day"
            class="metrics-bar-slot"
            :title="`${point.day}: ${format(point[series])} ${seriesLabel.toLowerCase()}`"
          >
            <div
              class="metrics-bar"
              :style="{ height: `${(point[series] / chartMax) * 100}%` }"
            ></div>
          </div>
        </div>
        <div class="metrics-axis">
          <span>{{ data.series[0]?.day }}</span>
          <span>peak {{ format(peak) }}</span>
          <span>{{ data.series[data.series.length - 1]?.day }}</span>
        </div>
      </div>

      <div class="metrics-lists">
        <div v-for="list in lists" :key="list.title" class="metrics-list-card">
          <h3 class="metrics-heading">{{ list.title }}</h3>
          <p v-if="!list.rows.length" class="social-meta">Nothing yet.</p>
          <ol v-else class="metrics-list">
            <li v-for="row in list.rows" :key="row.name">
              <span class="metrics-name" :title="row.name">{{ row.name }}</span>
              <span class="metrics-count">{{ format(row.count) }}</span>
            </li>
          </ol>
          <p class="social-meta metrics-list-note">{{ list.note }}</p>
        </div>
      </div>

      <p class="social-meta">
        Days are UTC. Visitors are counted per browser; admin pages and known bots are not counted.
        Mark any element with <code>data-track="name"</code> to give its clicks a clearer label.
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { adminAPI } from '@/services/api'
import { apiErrorMessage } from '@/utils/social'

type Point = { day: string; views: number; visitors: number; clicks: number; signups: number }
type Metrics = {
  days: number
  users: { total: number; new: number; active: number }
  totals: { views: number; clicks: number; visitors: number; signedIn: number }
  series: Point[]
  pages: Array<{ path: string; views: number; visitors: number }>
  clicks: Array<{ target: string; clicks: number; visitors: number }>
  referrers: Array<{ host: string; visitors: number }>
}

const RANGES = [7, 30, 90] as const
const SERIES = [
  { id: 'views', label: 'Views' },
  { id: 'visitors', label: 'Visitors' },
  { id: 'clicks', label: 'Clicks' },
  { id: 'signups', label: 'Sign-ups' },
] as const

const days = ref<(typeof RANGES)[number]>(30)
const series = ref<(typeof SERIES)[number]['id']>('views')
const data = ref<Metrics | null>(null)
const loading = ref(false)
const error = ref('')
let seq = 0

const numberFormat = new Intl.NumberFormat()
const format = (value: number) => numberFormat.format(value)

const tiles = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: 'Total users', value: d.users.total, note: `+${format(d.users.new)} new` },
    { label: 'Active users', value: d.users.active, note: 'signed in and active' },
    { label: 'Visitors', value: d.totals.visitors, note: `${format(d.totals.signedIn)} signed in` },
    { label: 'Page views', value: d.totals.views, note: perVisitor(d.totals.views) },
    { label: 'Clicks', value: d.totals.clicks, note: perVisitor(d.totals.clicks) },
  ]
})

function perVisitor(count: number) {
  const visitors = data.value?.totals.visitors
  return visitors ? `${(count / visitors).toFixed(1)} per visitor` : ''
}

const seriesLabel = computed(() => SERIES.find((s) => s.id === series.value)!.label)
const peak = computed(() => Math.max(0, ...(data.value?.series.map((p) => p[series.value]) ?? [])))
const chartMax = computed(() => Math.max(1, peak.value))
const chartLabel = computed(
  () => `${seriesLabel.value} per day for the last ${days.value} days, peak ${peak.value}`,
)

const lists = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    {
      title: 'Top pages',
      note: 'By page views.',
      rows: d.pages.map((row) => ({ name: row.path, count: row.views })),
    },
    {
      title: 'Top clicks',
      note: 'link: inside the site, out: other sites.',
      rows: d.clicks.map((row) => ({ name: row.target, count: row.clicks })),
    },
    {
      title: 'Referrers',
      note: 'Visitors arriving from other sites.',
      rows: d.referrers.map((row) => ({ name: row.host, count: row.visitors })),
    },
  ]
})

async function load() {
  const current = ++seq
  loading.value = true
  try {
    const response = await adminAPI.getMetrics(days.value)
    if (current !== seq) return
    data.value = response.data.data
    error.value = ''
  } catch (err) {
    if (current === seq) error.value = apiErrorMessage(err, 'Could not load metrics.')
  } finally {
    if (current === seq) loading.value = false
  }
}

watch(days, load)
onMounted(load)
</script>

<style scoped>
.metrics-head,
.metrics-chart-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.kind-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.kind-tab {
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.kind-tab:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-hover);
  color: var(--coral-deep);
}

.kind-tab.active {
  background: var(--coral-primary);
  border-color: var(--coral-primary);
  color: var(--text-on-accent);
}

.kind-tab:disabled {
  opacity: 0.6;
  cursor: default;
}

.metrics-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.metrics-tile,
.metrics-chart-card,
.metrics-list-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-card);
  padding: 0.9rem 1rem;
}

.metrics-tile {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.metrics-tile-label {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.metrics-tile-value {
  color: var(--text-primary);
  font-size: 1.6rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.metrics-tile-note {
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.metrics-chart-card {
  margin-bottom: 1rem;
}

.metrics-heading {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.95rem;
  font-weight: 600;
}

.metrics-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 160px;
}

.metrics-bar-slot {
  display: flex;
  flex: 1;
  align-items: flex-end;
  height: 100%;
  min-width: 0;
}

.metrics-bar-slot:hover .metrics-bar {
  background: var(--coral-deep);
}

.metrics-bar {
  width: 100%;
  min-height: 1px;
  border-radius: 3px 3px 0 0;
  background: var(--coral-primary);
}

.metrics-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 0.4rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.metrics-lists {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.metrics-list {
  margin: 0.6rem 0 0;
  padding: 0;
  list-style: none;
}

.metrics-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.85rem;
}

.metrics-list li:last-child {
  border-bottom: none;
}

.metrics-name {
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metrics-count {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.metrics-list-note {
  margin-top: 0.5rem;
  font-size: 0.75rem;
}

.admin-error {
  color: var(--error-color);
}
</style>
