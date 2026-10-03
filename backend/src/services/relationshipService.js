/**
 * Sequel/prequel/related lookup for catalog titles.
 * Domain service: MAL related_anime ingest, franchise inheritance, title-pattern matching,
 * and genre-similar fallback. Results are cached in memory for 10 minutes.
 */
import Content from '../models/Content.js'
import { query } from '../../config/postgres.js'
import { contentTitleMatchOr } from '../utils/titles.js'
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

class RelationshipService {
  constructor() {
    this.cache = new Map()
    this.cacheTimeout = 10 * 60 * 1000

    this.relationshipPatterns = {
      numbered: /(.*?)\s*(\d+)$/,
      roman: /(.*?)\s*([IVX]+)$/,
      part: /(.*?)\s*[:\-]\s*(part|chapter|episode)\s*(\d+)$/i,
      subtitle: /(.*?)\s*[:\-]\s*(.*)$/,
      movie: /(.*?)\s*movie\s*(\d*)$/i,
      season: /(.*?)\s*season\s*(\d+)$/i,
    }
  }

  /**
   * Sequels/prequels/related for a catalog id, served from cache when fresh.
   * @param {string} contentId
   * @returns {Promise<{ sequels: object[], prequels: object[], related: object[] }>}
   */
  async findRelatedContent(contentId) {
    try {
      const cacheKey = `rel_${contentId}`
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data
      }

      const content = await Content.findById(contentId).lean()
      if (!content) {
        return { sequels: [], prequels: [], related: [] }
      }

      const result = await this.findSmartRelationships(content)

      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      })

      console.log(`Cached result for content ${contentId}`)
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
   * Same type, overlapping genres, runtime ±30 min or episodes ±10, ranked by unifiedScore.
   * @param {object} content
   * @param {number} [limit=5]
   * @returns {Promise<object[]>}
   */
  async getGenreBasedRecommendations(content, limit = 5) {
    try {
      if (!content.genres || content.genres.length === 0) {
        return []
      }

      const genreNames = content.genres
        .map((genre) => (typeof genre === 'string' ? genre : genre.name))
        .filter(Boolean)

      if (genreNames.length === 0) return []

      const runtimeRange = content.runtime
        ? {
            $gte: Math.max(0, content.runtime - 30),
            $lte: content.runtime + 30,
          }
        : null

      const episodeRange = content.episodeCount
        ? {
            $gte: Math.max(0, content.episodeCount - 10),
            $lte: content.episodeCount + 10,
          }
        : null

      const recommendations = await Content.find({
        _id: { $ne: content._id },
        contentType: content.contentType,
        $or: [{ 'genres.name': { $in: genreNames } }, { genres: { $in: genreNames } }],
        ...(runtimeRange && { runtime: runtimeRange }),
        ...(episodeRange && { episodeCount: episodeRange }),
      })
        .lean()
        .sort({ unifiedScore: -1, popularity: -1 })
        .limit(limit)

      return recommendations
    } catch (error) {
      console.error('Error getting genre-based recommendations:', error)
      return []
    }
  }

  /**
   * Drop the in-memory related-content cache.
   * @returns {void}
   */
  clearCache() {
    this.cache.clear()
    console.log('Relationship service cache cleared')
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

      const relationships = {
        sequels: [],
        prequels: [],
        related: [],
      }

      await query(`DELETE FROM content_relations WHERE from_id = $1 AND source = 'mal'`, [
        content._id,
      ])

      const seen = new Set()
      for (const relation of malData.related_anime) {
        const kind = MAL_KIND[String(relation.relation_type || '').toLowerCase()] || 'other'
        const relatedMalId = relation.node?.id
        if (!relatedMalId) continue

        const relatedContent = await Content.findOne({ malId: relatedMalId })
        if (!relatedContent || String(relatedContent._id) === String(content._id)) continue

        const key = `${relatedContent._id}:${kind}`
        if (seen.has(key)) continue
        seen.add(key)

        await query(
          `INSERT INTO content_relations (from_id, to_id, kind, source)
           VALUES ($1, $2, $3, 'mal')
           ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
          [content._id, relatedContent._id, kind],
        )

        if (kind === 'sequel') relationships.sequels.push(relatedContent._id)
        else if (kind === 'prequel') relationships.prequels.push(relatedContent._id)
        else relationships.related.push(relatedContent._id)
      }

      if (!content.relationships) {
        content.relationships = {
          sequels: [],
          prequels: [],
          related: [],
        }
      }

      content.relationships.sequels = relationships.sequels
      content.relationships.prequels = relationships.prequels
      content.relationships.related = relationships.related

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
   * Same contentType whose title starts with the extracted base title.
   * @param {object} content
   * @returns {Promise<object[]>}
   */
  async findByPatterns(content) {
    const related = []
    const baseTitle = this.extractBaseTitle(content.englishTitle || content.title)

    if (!baseTitle) return related

    const similarContent = await Content.find({
      _id: { $ne: content._id },
      contentType: content.contentType,
      $or: contentTitleMatchOr({ $regex: `^${this.escapeRegex(baseTitle)}`, $options: 'i' }),
    })
      .lean()
      .limit(10)

    return similarContent
  }




  /**
   * Existing catalog rows whose title starts with `baseTitle`.
   * @param {string} baseTitle
   * @returns {Promise<object[]>}
   */
  async findRelatedByTitlePattern(baseTitle) {
    const similarContent = await Content.find({
      $or: contentTitleMatchOr({ $regex: `^${this.escapeRegex(baseTitle)}`, $options: 'i' }),
    }).limit(5)

    return similarContent
  }


  /**
   * Strip numbered/roman/part/movie/season suffixes to get a series root title.
   * @param {string} title
   * @returns {string | null}
   */
  extractBaseTitle(title) {
    if (!title) return null

    for (const [, pattern] of Object.entries(this.relationshipPatterns)) {
      const match = title.match(pattern)
      if (match) {
        return match[1].trim()
      }
    }

    return title.trim()
  }


  /**
   * Unique related documents by `_id`.
   * @param {object[]} relatedContent
   * @returns {object[]}
   */
  deduplicateRelated(relatedContent) {
    const seen = new Set()
    return relatedContent.filter((content) => {
      const key = content._id.toString()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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

  /**
   * Escape a string for use inside a RegExp.
   * @param {string} string
   * @returns {string}
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

export default new RelationshipService()
