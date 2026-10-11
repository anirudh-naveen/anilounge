/**
 * Fribb's anime-lists, downloaded once per process (about 8 MB) and indexed by MAL and
 * AniList id (utils/fribb.js). `FRIBB_LIST_PATH` reads a local copy instead.
 *
 * Domain service used by the catalog import and the series migration. When the list
 * can't be loaded, callers carry on without it.
 */
import fs from 'fs'
import { indexFribb } from '../utils/fribb.js'

const LIST_URL = 'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json'
const FETCH_TIMEOUT_MS = 60000

let loading = null

/**
 * The indexed list, or null when it can't be loaded.
 * @returns {Promise<{ byMal: Map<number, object>, byAnilist: Map<number, object> } | null>}
 */
export function loadFribbIndex() {
  loading ||= (async () => {
    try {
      const local = process.env.FRIBB_LIST_PATH
      const list = local
        ? JSON.parse(fs.readFileSync(local, 'utf8'))
        : await (await fetch(LIST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })).json()
      const index = indexFribb(list)
      console.log(`Fribb anime-lists: ${index.byMal.size} MAL entries`)
      return index
    } catch (error) {
      console.error('Fribb anime-lists unavailable:', error.message)
      return null
    }
  })()
  return loading
}
