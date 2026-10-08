/**
 * Sequel/prequel/related lookup for catalog titles.
 * Domain service: MAL related_anime ingest, franchise inheritance, and the related-titles
 * lookup for detail pages. Lookups are cached in memory for 10 minutes.
 */
import Content from '../models/Content.js'
import { query } from '../../config/postgres.js'
import { UNLINKED_RELATION_KINDS } from './franchiseBuilder.js'

const MAL_KIND = {
  sequel: 'sequel',
  prequel: 'prequel',
  side_story: 'side_story',
  parent_story: 'parent_story',
  alternative_setting: 'alternative_setting',
  alternative_version: 'alternative_version',
  summary: 'summary',
  full_story: 'full_story',
}

const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 1000

class RelationshipService {
  constructor() {
    this.cache = new Map()
  }

  /**
   * Sequels/prequels/related for a catalog id, served from cache when fresh.
   * @param {string} contentId
   * @returns {Promise<{ sequels: object[], prequels: object[], related: object[] }>}
   */
  async findRelatedContent(contentId) {
    try {
      const cacheKey = String(contentId)
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data
      }

      const content = await Content.findById(contentId).lean()
      if (!content) {
        return { sequels: [], prequels: [], related: [] }
      }

      const result = await this.findSmartRelationships(content)

      this.cache.delete(cacheKey)
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() })
      if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value)
      return result
    } catch (error) {
      console.error('Error finding related content:', error)
      return { sequels: [], prequels: [], related: [] }
    }
  }

  /**
   * Stored typed edges first, then other titles in the same franchise row.
   * Does not infer related titles from genre, runtime, or title regex.
   * @param {object} content
   * @returns {Promise<{ sequels: object[], prequels: object[], related: object[] }>}
   */
  async findSmartRelationships(content) {
    const result = { sequels: [], prequels: [], related: [] }

    const sequelIds = (content.relationships?.sequels || []).map((row) => String(row._id || row))
    const prequelIds = (content.relationships?.prequels || []).map((row) => String(row._id || row))
    const relatedIds = (content.relationships?.related || []).map((row) => String(row._id || row))
    const storedIds = [...sequelIds, ...prequelIds, ...relatedIds]

    if (storedIds.length > 0) {
      const allRelatedContent = await Content.find({ _id: { $in: storedIds } }).lean()
      const byId = (ids) =>
        allRelatedContent.filter((row) => ids.includes(String(row._id)))
      result.sequels = byId(sequelIds)
      result.prequels = byId(prequelIds)
      result.related = byId(relatedIds)
      return result
    }

    if (content.franchise) {
      const franchiseContent = await Content.find({
        franchise: content.franchise,
        _id: { $ne: content._id },
      })
        .sort({ releaseDate: 1 })
        .lean()
      if (franchiseContent.length > 0) {
        return this.categorizeRelationships(franchiseContent, content)
      }
    }

    return result
  }

  /**
   * Load MAL related_anime and write typed content_relations rows.
   * sequel/prequel stay dedicated; other MAL relation_type values keep their kind.
   * @param {object} content
   * @returns {Promise<object>} The same content object with relationships filled when MAL data exists
   */
  async populateRelationshipsFromMAL(content) {
    try {
      if (!content.malId) {
        return content
      }

      const malApiUrl = `https://api.myanimelist.net/v2/anime/${content.malId}?fields=related_anime`
      const response = await fetch(malApiUrl, {
        headers: {
          'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID || '',
        },
        // Without a timeout a stalled MAL connection hangs whatever is saving the title.
        signal: AbortSignal.timeout(20000),
      })

      if (!response.ok) {
        console.log(`MAL API request failed for ${content.malId}: ${response.status}`)
        return content
      }

      const malData = await response.json()

      if (!malData.related_anime || !Array.isArray(malData.related_anime)) {
        return content
      }

      // One lookup for every related MAL id (the best-scored title when a MAL id
      // appears on more than one row, as Content.findOne would pick).
      const malIds = [
        ...new Set(malData.related_anime.map((relation) => Number(relation.node?.id)).filter(Boolean)),
      ]
      const { rows } = malIds.length
        ? await query(
            `SELECT DISTINCT ON (mal_id) id::text AS id, mal_id FROM works
             WHERE mal_id = ANY($1::int[])
             ORDER BY mal_id, unified_score DESC NULLS LAST`,
            [malIds],
          )
        : { rows: [] }
      const idByMal = new Map(rows.map((row) => [Number(row.mal_id), row.id]))

      const relationships = { sequels: [], prequels: [], related: [] }
      const edges = []
      const seen = new Set()
      for (const relation of malData.related_anime) {
        const kind = MAL_KIND[String(relation.relation_type || '').toLowerCase()] || 'other'
        const toId = idByMal.get(Number(relation.node?.id))
        if (!toId || toId === String(content._id)) continue

        const key = `${toId}:${kind}`
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({ toId, kind })

        if (kind === 'sequel') relationships.sequels.push(toId)
        else if (kind === 'prequel') relationships.prequels.push(toId)
        else relationships.related.push(toId)
      }

      await query(`DELETE FROM content_relations WHERE from_id = $1 AND source = 'mal'`, [
        content._id,
      ])
      if (edges.length) {
        await query(
          `INSERT INTO content_relations (from_id, to_id, kind, source)
           SELECT $1, t.to_id, t.kind, 'mal'
           FROM unnest($2::uuid[], $3::text[]) AS t(to_id, kind)
           ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
          [content._id, edges.map((edge) => edge.toId), edges.map((edge) => edge.kind)],
        )
      }

      content.relationships = { ...content.relationships, ...relationships }

      const inherited = await this.inheritFranchiseFromRelations(content._id)
      if (inherited) {
        content.franchise = inherited
        content.relationships.franchise = inherited
      }

      console.log(`Updated relationships for ${content.title}:`, relationships)
      return content
    } catch (error) {
      console.error('Error fetching MAL relationships:', error)
      return content
    }
  }

  /**
   * Put a title with no franchise into the franchise its typed relations share
   * (sequel, prequel, side story, ...), right after a MAL sync stores the relations.
   * Uses the same linking rules as the franchise builder (franchiseBuilder.js).
   * @param {string} contentId
   * @returns {Promise<string|null>} The franchise name joined, or null.
   */
  async inheritFranchiseFromRelations(contentId) {
    const { rows } = await query(
      `SELECT DISTINCT fm.franchise_id, f.name
       FROM content_relations r
       JOIN franchise_members fm
         ON fm.member_id = CASE WHEN r.from_id = $1 THEN r.to_id ELSE r.from_id END
       JOIN content f ON f.id = fm.franchise_id AND f.kind = 'franchise'
       WHERE (r.from_id = $1 OR r.to_id = $1) AND r.kind <> ALL($2::text[])
         AND NOT EXISTS (SELECT 1 FROM franchise_members own WHERE own.member_id = $1)`,
      [contentId, UNLINKED_RELATION_KINDS],
    )
    // Related titles in different franchises: leave it for an admin to decide.
    if (rows.length !== 1) return null
    await query(
      'INSERT INTO franchise_members (franchise_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [rows[0].franchise_id, contentId],
    )
    return rows[0].name
  }

  /**
   * Split a related set into sequels, prequels, and related using release-year order.
   * @param {object[]} relatedContent
   * @param {object} originalContent
   * @returns {{ sequels: object[], prequels: object[], related: object[] }}
   */
  categorizeRelationships(relatedContent, originalContent) {
    const sequels = []
    const prequels = []
    const related = []

    relatedContent.forEach((content) => {
      const relationship = this.determineRelationship(originalContent, content)

      switch (relationship) {
        case 'sequel':
          sequels.push(content)
          break
        case 'prequel':
          prequels.push(content)
          break
        default:
          related.push(content)
      }
    })

    return { sequels, prequels, related }
  }

  /**
   * Newer release year → sequel, older → prequel, missing/same year → related.
   * @param {object} original
   * @param {object} related
   * @returns {'sequel' | 'prequel' | 'related'}
   */
  determineRelationship(original, related) {
    const originalYear = this.extractYear(original.releaseDate)
    const relatedYear = this.extractYear(related.releaseDate)

    if (!originalYear || !relatedYear) {
      return 'related'
    }

    if (relatedYear > originalYear) {
      return 'sequel'
    } else if (relatedYear < originalYear) {
      return 'prequel'
    }

    return 'related'
  }

  /**
   * Calendar year from a Date or date string.
   * @param {Date | string | null | undefined} releaseDate
   * @returns {number | null}
   */
  extractYear(releaseDate) {
    if (!releaseDate) return null
    const date = new Date(releaseDate)
    return date.getFullYear()
  }
}

export default new RelationshipService()
