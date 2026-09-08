<template>
  <nav v-if="totalPages > 1" class="pagination" aria-label="Pagination">
    <button
      type="button"
      class="btn btn-secondary"
      :disabled="currentPage <= 1"
      @click="goTo(currentPage - 1)"
    >
      Previous
    </button>

    <div class="pagination-pages">
      <template v-for="(item, index) in paginationItems" :key="`${item}-${index}`">
        <span v-if="item === 'ellipsis'" class="pagination-ellipsis" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          class="pagination-page"
          :class="{ active: item === currentPage }"
          :aria-current="item === currentPage ? 'page' : undefined"
          :aria-label="`Page ${item}`"
          @click="goTo(item)"
        >
          {{ item }}
        </button>
      </template>
    </div>

    <button
      type="button"
      class="btn btn-secondary"
      :disabled="currentPage >= totalPages"
      @click="goTo(currentPage + 1)"
    >
      Next
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getPaginationItems } from '@/utils/pagination'

const props = defineProps<{
  currentPage: number
  totalPages: number
}>()

const emit = defineEmits<{
  change: [page: number]
}>()

const paginationItems = computed(() => getPaginationItems(props.currentPage, props.totalPages))

const goTo = (page: number) => {
  if (page < 1 || page > props.totalPages || page === props.currentPage) return
  emit('change', page)
}
</script>

<style scoped>
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin-top: 2rem;
}

.pagination-pages {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
}

.pagination-page,
.pagination-ellipsis {
  min-width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
}

.pagination-page {
  padding: 0 0.4rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.3s ease;
}

.pagination-page:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.pagination-page.active {
  background: linear-gradient(90deg, var(--coral-light), var(--teal-light));
  border-color: transparent;
  cursor: default;
  transform: none;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.pagination-ellipsis {
  opacity: 0.8;
}

.btn {
  display: inline-block;
  padding: 12px 24px;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.3s ease;
  border: none;
  cursor: pointer;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

@media (max-width: 768px) {
  .btn {
    padding: 8px 14px;
  }

  .pagination-page,
  .pagination-ellipsis {
    min-width: 2rem;
    height: 2rem;
    font-size: 0.9rem;
  }
}
</style>
