/**
 * Sequel/prequel/related lookup for catalog titles.
 * Domain service: known franchise map, MAL related_anime ingest, title-pattern matching,
 * and genre-similar fallback. Results are cached in memory for 10 minutes.
 */
import Content from '../models/Content.js'
import { query } from '../../config/postgres.js'
import { contentTitleMatchOr } from '../utils/titles.js'

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

    // Hand-maintained crosswalk of franchise titles to TMDB/MAL ids
    this.franchiseMap = {
      'Toy Story': {
        titles: ['Toy Story', 'Toy Story 2', 'Toy Story 3', 'Toy Story 4'],
        tmdbIds: [862, 1245, 10193, 301528],
        malIds: [],
      },
      'How to Train Your Dragon': {
        titles: [
          'How to Train Your Dragon',
          'How to Train Your Dragon 2',
          'How to Train Your Dragon: The Hidden World',
        ],
        tmdbIds: [10191, 82702, 166428],
        malIds: [],
      },
      'Despicable Me': {
        titles: [
          'Despicable Me',
          'Despicable Me 2',
          'Despicable Me 3',
          'Minions',
          'Minions: The Rise of Gru',
        ],
        tmdbIds: [20352, 93456, 324852, 211672, 438148],
        malIds: [],
      },
      'One Piece': {
        titles: ['One Piece', 'One Piece Film', 'One Piece Movie', 'One Piece Fan Letter'],
        tmdbIds: [37854, 37854, 37854, 37854],
        malIds: [21, 21, 21, 21],
      },
      'My Hero Academia': {
        titles: [
          'My Hero Academia',
          "My Hero Academia: You're Next",
          'My Hero Academia: Heroes Rising',
        ],
        tmdbIds: [37854, 37854, 37854],
        malIds: [31964, 31964, 31964],
      },
      'Attack on Titan': {
        titles: ['Attack on Titan', 'Shingeki no Kyojin', 'Attack on Titan: The Final Season'],
        tmdbIds: [37854, 37854, 37854],
        malIds: [16498, 16498, 16498],
      },
      Gintama: {
        titles: [
          'Gintama',
          'Gintama Movie',
          'Gintama: The Final',
          'Gintama. Shirogane no Tamashii-hen - Kouhan-sen',
          "Gintama'",
          "Gintama': Enchousen",
          'Gintama Movie 2: Kanketsu-hen - Yorozuya yo Eien Nare',
          'Gintama.',
        ],
        tmdbIds: [],
        malIds: [918, 9969, 15417, 15335, 28977, 34096, 37491, 39486],
      },
      'Chainsaw Man': {
        titles: ['Chainsaw Man', 'Chainsaw Man Movie', 'Chainsaw Man: Reze-hen'],
        tmdbIds: [37854, 37854, 37854],
        malIds: [44511, 44511, 57555],
      },
      Naruto: {
        titles: ['Naruto', 'Naruto Shippuden', 'Naruto Movie', 'Boruto'],
        tmdbIds: [37854, 37854, 37854, 37854],
        malIds: [11, 11, 11, 11],
      },
      'Spider-Man': {
        titles: [
          'Spider-Man',
          'Spider-Man: Into the Spider-Verse',
          'Spider-Man: Across the Spider-Verse',
        ],
        tmdbIds: [324857, 324857, 324857],
        malIds: [],
      },
      Monogatari: {
        titles: ['Bakemonogatari', 'Kizumonogatari', 'Nisemonogatari', 'Monogatari Series'],
        tmdbIds: [37854, 37854, 37854, 37854],
        malIds: [5081, 5081, 5081, 5081],
      },
      'Solo Leveling': {
        titles: [
          'Solo Leveling',
          'Ore dake Level Up na Ken',
          'Ore dake Level Up na Ken Season 2: Arise from the Shadow',
          'Solo Leveling -ReAwakening-',
          'Ore dake Level Up na Ken: ReAwakening',
          'Ore dake Level Up na Ken: How to Get Stronger',
        ],
        tmdbIds: [127532, 127532, 127532, 127532, 127532, 127532],
        malIds: [142845, 142845, 142845, 142845, 142845, 142845],
      },
      'Demon Slayer': {
        titles: [
          'Demon Slayer: Kimetsu no Yaiba',
          'Demon Slayer: Kimetsu no Yaiba the Movie: Mugen Train',
          'Demon Slayer: Kimetsu no Yaiba - Entertainment District Arc',
          'Demon Slayer: Kimetsu no Yaiba - Swordsmith Village Arc',
          'Demon Slayer: Kimetsu no Yaiba - Hashira Training Arc',
        ],
        tmdbIds: [121063, 121063, 121063, 121063, 121063],
        malIds: [38000, 38000, 38000, 38000, 38000],
      },
      'Jujutsu Kaisen': {
        titles: [
          'Jujutsu Kaisen',
          'Jujutsu Kaisen 0',
          'Jujutsu Kaisen Season 2',
          'Jujutsu Kaisen: Hidden Inventory / Premature Death',
          'Jujutsu Kaisen: Shibuya Incident',
        ],
        tmdbIds: [95451, 95451, 95451, 95451, 95451],
        malIds: [40748, 40748, 40748, 40748, 40748],
      },
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
   * Drop the in-memory related-content cache (after franchise map edits).
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

      console.log(`Updated relationships for ${content.title}:`, relationships)
      return content
    } catch (error) {
      console.error('Error fetching MAL relationships:', error)
      return content
    }
  }

  /**
   * During ingest: MAL uses related_anime; other sources stamp franchise from the static map.
   * @param {object} content
   * @param {object} externalData
   * @param {'tmdb' | 'mal'} source
   * @returns {Promise<object>}
   */
  async populateRelationshipsFromExternalData(content, externalData, source) {
    try {
      if (source === 'mal' && content.malId) {
        return await this.populateRelationshipsFromMAL(content)
      }

      const relationships = await this.detectRelationshipsFromExternalData(externalData, source)

      if (relationships.franchise) {
        content.franchise = relationships.franchise
      }

      if (!content.relationships) {
        content.relationships = {
          sequels: [],
          prequels: [],
          related: [],
          franchise: relationships.franchise?.name || null,
        }
      }

      return content
    } catch (error) {
      console.error('Error populating relationships from external data:', error)
      return content
    }
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
   * Titles in the same franchiseMap entry, matched by title string or TMDB/MAL id.
   * @param {object} content
   * @returns {Promise<object[]>}
   */
  async findByFranchise(content) {
    const related = []

    for (const [, franchiseData] of Object.entries(this.franchiseMap)) {
      if (
        this.isInFranchise(content.englishTitle || content.title, franchiseData.titles) ||
        this.isInFranchise(content.nativeTitle || content.originalTitle, franchiseData.titles)
      ) {
        const allMatches = await Content.find({
          _id: { $ne: content._id },
          contentType: content.contentType,
          $or: [
            ...franchiseData.titles.flatMap((title) =>
              contentTitleMatchOr({ $regex: this.escapeRegex(title), $options: 'i' }),
            ),
            ...(franchiseData.tmdbIds.length > 0
              ? [{ tmdbId: { $in: franchiseData.tmdbIds } }]
              : []),
            ...(franchiseData.malIds.length > 0 ? [{ malId: { $in: franchiseData.malIds } }] : []),
          ],
        })
          .lean()
          .limit(20)

        related.push(...allMatches)
      }
    }

    return related
  }

  /**
   * Franchise membership from an upstream TMDB/MAL payload (ids only; no sequel lists).
   * @param {object} externalData
   * @param {'tmdb' | 'mal'} source
   * @returns {Promise<{ sequels: unknown[], prequels: unknown[], related: unknown[], franchise: object | null }>}
   */
  async detectRelationshipsFromExternalData(externalData, source) {
    const relationships = {
      sequels: [],
      prequels: [],
      related: [],
      franchise: null,
    }

    const franchise = this.findFranchiseByExternalId(externalData, source)
    if (franchise) {
      relationships.franchise = franchise
    }

    return relationships
  }

  /**
   * Look up franchiseMap by TMDB id or MAL id (raw `{ id }` or `{ node.id }`).
   * @param {object} externalData
   * @param {'tmdb' | 'mal'} source
   * @returns {{ name: string, titles: string[], tmdbIds: number[], malIds: number[] } | null}
   */
  findFranchiseByExternalId(externalData, source) {
    let externalId

    if (source === 'tmdb') {
      externalId = externalData.id
    } else {
      externalId = externalData.id || externalData.node?.id
    }

    for (const [franchiseName, franchiseData] of Object.entries(this.franchiseMap)) {
      const ids = source === 'tmdb' ? franchiseData.tmdbIds : franchiseData.malIds
      if (ids.includes(externalId)) {
        return {
          name: franchiseName,
          titles: franchiseData.titles,
          tmdbIds: franchiseData.tmdbIds,
          malIds: franchiseData.malIds,
        }
      }
    }

    return null
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
   * Stamp franchise name onto an existing document during TMDB/MAL merge.
   * @param {object} existingContent
   * @param {object} newData
   * @param {'tmdb' | 'mal'} source
   * @returns {Promise<object>}
   */
  async processRelationshipsDuringMerge(existingContent, newData, source) {
    const newRelationships = await this.detectRelationshipsFromExternalData(newData, source)

    if (newRelationships.franchise) {
      existingContent.franchise = newRelationships.franchise.name
    }

    if (!existingContent.relationships) {
      existingContent.relationships = {
        sequels: [],
        prequels: [],
        related: [],
        franchise: null,
      }
    }

    if (newRelationships.franchise) {
      existingContent.relationships.franchise = newRelationships.franchise.name
    }

    return existingContent
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
   * Whole-word / prefix franchise membership (avoids "One" matching "One Piece" siblings loosely).
   * @param {string} title
   * @param {string[]} franchiseTitles
   * @returns {boolean}
   */
  isInFranchise(title, franchiseTitles) {
    if (!title) return false
    const titleLower = title.toLowerCase()
    return franchiseTitles.some((franchiseTitle) => {
      const franchiseLower = franchiseTitle.toLowerCase()
      return (
        titleLower === franchiseLower ||
        titleLower.startsWith(franchiseLower + ' ') ||
        titleLower.includes(' ' + franchiseLower + ' ') ||
        titleLower.endsWith(' ' + franchiseLower)
      )
    })
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
