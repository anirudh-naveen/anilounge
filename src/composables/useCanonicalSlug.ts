/**
 * useCanonicalSlug.ts — put the page's readable slug in the address bar.
 *
 * Links inside the app only carry the id (`/movie/<id>`); once the page knows its name
 * it replaces the URL with `/movie/<slug>/<id>` (same history entry, query and hash
 * kept), and fixes a stale slug. The view isn't remounted: App.vue keys pages by route
 * name and id.
 */

import { toValue, watchEffect, type MaybeRefOrGetter } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { slugify } from '@/utils/slug'

/**
 * @param name - Display name, or null while loading.
 * @param id - The id the name belongs to; the slug is only applied while the route
 *   still shows it (so a page switching ids doesn't stamp the old name on the new one).
 */
export function useCanonicalSlug(
  name: MaybeRefOrGetter<string | null | undefined>,
  id: MaybeRefOrGetter<string | null | undefined>,
) {
  const route = useRoute()
  const router = useRouter()

  watchEffect(() => {
    const value = toValue(name)
    const forId = toValue(id)
    if (!value || !forId || String(route.params.id) !== String(forId)) return
    const slug = slugify(value)
    const current = String(route.params.slug || '')
    if (slug === current) return
    void router.replace({
      name: route.name!,
      params: { ...route.params, slug: slug || undefined },
      query: route.query,
      hash: route.hash,
    })
  })
}
