import Content from '../models/Content.js'

class RelationshipService {
  constructor() {
    // Simple in-memory cache for related content
    this.cache = new Map()
    this.cacheTimeout = 10 * 60 * 1000 // 10 minutes (longer cache for better performance)

    this.relationshipPatterns = {
      // Numbered sequels
      numbered: /(.*?)\s*(\d+)$/,
      // Roman numerals
      roman: /(.*?)\s*([IVX]+)$/,
      // Part indicators
      part: /(.*?)\s*[:\-]\s*(part|chapter|episode)\s*(\d+)$/i,
      // Subtitle patterns
      subtitle: /(.*?)\s*[:\-]\s*(.*)$/,
      // Movie series indicators
      movie: /(.*?)\s*movie\s*(\d*)$/i,
      // Season indicators
      season: /(.*?)\s*season\s*(\d+)$/i,
    }

    // Enhanced franchise mapping with MAL and TMDB cross-references
    this.franchiseMap = {
      'Toy Story': {
        titles: ['Toy Story', 'Toy Story 2', 'Toy Story 3', 'Toy Story 4'],
        tmdbIds: [862, 1245, 10193, 301528],
        malIds: [], // No MAL entries for Toy Story
      },
      'How to Train Your Dragon': {
        titles: [
          'How to Train Your Dragon',
          'How to Train Your Dragon 2',
          'How to Train Your Dragon: The Hidden World',
        ],
        tmdbIds: [10191, 82702, 166428],
        malIds: [], // No MAL entries for How to Train Your Dragon
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
        malIds: [], // No MAL entries for Despicable Me
      },
      'One Piece': {
        titles: ['One Piece', 'One Piece Film', 'One Piece Movie', 'One Piece Fan Letter'],
        tmdbIds: [37854, 37854, 37854, 37854], // One Piece TV series
        malIds: [21, 21, 21, 21], // One Piece MAL ID
      },
      'My Hero Academia': {
        titles: [
          'My Hero Academia',
          "My Hero Academia: You're Next",
          'My Hero Academia: Heroes Rising',
        ],
        tmdbIds: [37854, 37854, 37854], // Placeholder
        malIds: [31964, 31964, 31964], // Boku no Hero Academia MAL ID
      },
      'Attack on Titan': {
        titles: ['Attack on Titan', 'Shingeki no Kyojin', 'Attack on Titan: The Final Season'],
        tmdbIds: [37854, 37854, 37854], // Placeholder
        malIds: [16498, 16498, 16498], // Shingeki no Kyojin MAL ID
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
        tmdbIds: [], // No TMDB entries for Gintama (it's MAL-only)
        malIds: [918, 9969, 15417, 15335, 28977, 34096, 37491, 39486], // All Gintama MAL IDs
      },
      'Chainsaw Man': {
        titles: ['Chainsaw Man', 'Chainsaw Man Movie', 'Chainsaw Man: Reze-hen'],
        tmdbIds: [37854, 37854, 37854], // Placeholder
        malIds: [44511, 44511, 57555], // Updated with actual MAL ID from API
      },
      Naruto: {
        titles: ['Naruto', 'Naruto Shippuden', 'Naruto Movie', 'Boruto'],
        tmdbIds: [37854, 37854, 37854, 37854], // Placeholder
        malIds: [11, 11, 11, 11], // Naruto MAL ID
      },
      'Spider-Man': {
        titles: [
          'Spider-Man',
          'Spider-Man: Into the Spider-Verse',
          'Spider-Man: Across the Spider-Verse',
        ],
        tmdbIds: [324857, 324857, 324857], // Spider-Verse movies
        malIds: [], // No MAL entries for Spider-Man
      },
      Monogatari: {
        titles: ['Bakemonogatari', 'Kizumonogatari', 'Nisemonogatari', 'Monogatari Series'],
        tmdbIds: [37854, 37854, 37854, 37854], // Placeholder
        malIds: [5081, 5081, 5081, 5081], // Bakemonogatari MAL ID
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
        tmdbIds: [127532, 127532, 127532, 127532, 127532, 127532], // Solo Leveling TMDB ID
        malIds: [142845, 142845, 142845, 142845, 142845, 142845], // Solo Leveling MAL ID
      },
      'Demon Slayer': {
        titles: [
          'Demon Slayer: Kimetsu no Yaiba',
          'Demon Slayer: Kimetsu no Yaiba the Movie: Mugen Train',
          'Demon Slayer: Kimetsu no Yaiba - Entertainment District Arc',
          'Demon Slayer: Kimetsu no Yaiba - Swordsmith Village Arc',
          'Demon Slayer: Kimetsu no Yaiba - Hashira Training Arc',
        ],
        tmdbIds: [121063, 121063, 121063, 121063, 121063], // Demon Slayer TMDB ID
        malIds: [38000, 38000, 38000, 38000, 38000], // Demon Slayer MAL ID
      },
      'Jujutsu Kaisen': {
        titles: [
          'Jujutsu Kaisen',
          'Jujutsu Kaisen 0',
          'Jujutsu Kaisen Season 2',
          'Jujutsu Kaisen: Hidden Inventory / Premature Death',
          'Jujutsu Kaisen: Shibuya Incident',
        ],
        tmdbIds: [95451, 95451, 95451, 95451, 95451], // Jujutsu Kaisen TMDB ID
        malIds: [40748, 40748, 40748, 40748, 40748], // Jujutsu Kaisen MAL ID
      },
    }
  }

  /**
   * Find related content based on title patterns and franchises
   */
  async findRelatedContent(contentId) {
    try {
      // Check cache first with optimized key
      const cacheKey = `rel_${contentId}`
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data
      }

      const content = await Content.findById(contentId).lean() // Use lean() for faster query
      if (!content) {
        return { sequels: [], prequels: [], related: [] }
      }

      // Use smart relationship detection based on actual data
      const result = await this.findSmartRelationships(content)

      // Cache the result
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
   * Smart relationship detection based on actual content data
   */
  async findSmartRelationships(content) {
    const result = { sequels: [], prequels: [], related: [] }

    // Method 1: Check for existing relationships in content data
    if (
      content.relationships &&
      (content.relationships.sequels?.length > 0 ||
        content.relationships.prequels?.length > 0 ||
        content.relationships.related?.length > 0)
    ) {
      // Populate relationships from existing data
      const sequelIds = content.relationships.sequels?.map((s) => s._id || s) || []
      const prequelIds = content.relationships.prequels?.map((p) => p._id || p) || []
      const relatedIds = content.relationships.related?.map((r) => r._id || r) || []

      if (sequelIds.length > 0 || prequelIds.length > 0 || relatedIds.length > 0) {
        const allRelatedContent = await Content.find({
          _id: { $in: [...sequelIds, ...prequelIds, ...relatedIds] },
        }).lean() // Use lean() for faster queries

        result.sequels = allRelatedContent.filter((c) => sequelIds.includes(c._id.toString()))
        result.prequels = allRelatedContent.filter((c) => prequelIds.includes(c._id.toString()))
        result.related = allRelatedContent.filter((c) => relatedIds.includes(c._id.toString()))

        return result
      }
    }

    // Method 2: Use franchise mapping (fast and accurate)
    const franchiseContent = await this.findByFranchise(content)
    if (franchiseContent.length > 0) {
      return this.categorizeRelationships(franchiseContent, content)
    }

    // Method 3: Quick genre-based recommendations (faster than pattern matching)
    const genreRecommendations = await this.getGenreBasedRecommendations(content, 6)
    if (genreRecommendations.length > 0) {
      result.related = genreRecommendations
      console.log(`Using genre-based recommendations for ${content.title}`)
      return result
    }

    // Method 4: Use pattern matching only if no other method worked
    const relatedContent = await this.findByPatterns(content)
    if (relatedContent.length > 0) {
      return this.categorizeRelationships(relatedContent, content)
    }

    return result
  }

  /**
   * Get genre-based recommendations as fallback when no relationships are found
   */
  async getGenreBasedRecommendations(content, limit = 5) {
    try {
      if (!content.genres || content.genres.length === 0) {
        return []
      }

      // Extract genre names
      const genreNames = content.genres
        .map((genre) => (typeof genre === 'string' ? genre : genre.name))
        .filter(Boolean)

      if (genreNames.length === 0) return []

      // Find content with similar genres and similar runtime/episode count
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
        .lean() // Use lean() for faster queries
        .sort({ unifiedScore: -1, popularity: -1 })
        .limit(limit)

      return recommendations
    } catch (error) {
      console.error('Error getting genre-based recommendations:', error)
      return []
    }
  }

  /**
   * Clear cache (useful for testing or when franchise data is updated)
   */
  clearCache() {
    this.cache.clear()
    console.log('Relationship service cache cleared')
  }

  /**
   * Populate relationships from MAL API data
   * This fetches real relationship data from MAL API v2
   */
  async populateRelationshipsFromMAL(content) {
    try {
      if (!content.malId) {
        return content
      }

      // Fetch relationship data from MAL API
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

      // Parse MAL relationship data
      const relationships = {
        sequels: [],
        prequels: [],
        related: [],
      }

      for (const relation of malData.related_anime) {
        const relationType = relation.relation_type?.toLowerCase()
        const relatedMalId = relation.node?.id

        if (!relatedMalId) continue

        // Find the related content in our database
        const relatedContent = await Content.findOne({ malId: relatedMalId })
        if (!relatedContent) continue

        switch (relationType) {
          case 'sequel':
            relationships.sequels.push(relatedContent._id)
            break
          case 'prequel':
            relationships.prequels.push(relatedContent._id)
            break
          case 'alternative_setting':
          case 'alternative_version':
          case 'side_story':
          case 'parent_story':
          case 'summary':
          case 'full_story':
            relationships.related.push(relatedContent._id)
            break
          default:
            relationships.related.push(relatedContent._id)
        }
      }

      // Update content with real relationship data
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
   * Populate relationships from external API data during content creation
   * This should be called when content is first imported from TMDB/MAL
   */
  async populateRelationshipsFromExternalData(content, externalData, source) {
    try {
      if (source === 'mal' && content.malId) {
        // Use real MAL API data for relationships
        return await this.populateRelationshipsFromMAL(content)
      }

      // Fallback to franchise mapping for other sources
      const relationships = await this.detectRelationshipsFromExternalData(externalData, source)

      // Update the content with detected relationships
      if (relationships.franchise) {
        content.franchise = relationships.franchise
      }

      // Store relationship metadata for future use
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
   * Find related content based on title patterns
   */
  async findByPatterns(content) {
    const related = []
    const baseTitle = this.extractBaseTitle(content.title)

    if (!baseTitle) return related

    // Find content with similar base titles - use lean() for faster queries
    const similarContent = await Content.find({
      _id: { $ne: content._id },
      contentType: content.contentType,
      $or: [
        { title: { $regex: `^${this.escapeRegex(baseTitle)}`, $options: 'i' } },
        { originalTitle: { $regex: `^${this.escapeRegex(baseTitle)}`, $options: 'i' } },
      ],
    })
      .lean() // Use lean() for faster queries
      .limit(10)

    return similarContent
  }

  /**
   * Find related content based on known franchises using enhanced mapping
   */
  async findByFranchise(content) {
    const related = []

    for (const [, franchiseData] of Object.entries(this.franchiseMap)) {
      if (this.isInFranchise(content.title, franchiseData.titles)) {
        // Optimize: Combine all searches into a single query using $or
        const allMatches = await Content.find({
          _id: { $ne: content._id },
          contentType: content.contentType,
          $or: [
            // Search by titles
            ...franchiseData.titles.map((title) => ({
              $or: [
                { title: { $regex: this.escapeRegex(title), $options: 'i' } },
                { originalTitle: { $regex: this.escapeRegex(title), $options: 'i' } },
              ],
            })),
            // Search by TMDB IDs (only if there are any)
            ...(franchiseData.tmdbIds.length > 0
              ? [{ tmdbId: { $in: franchiseData.tmdbIds } }]
              : []),
            // Search by MAL IDs (only if there are any)
            ...(franchiseData.malIds.length > 0 ? [{ malId: { $in: franchiseData.malIds } }] : []),
          ],
        })
          .lean() // Use lean() for faster queries
          .limit(20) // Increased limit since we're combining queries

        related.push(...allMatches)
      }
    }

    return related
  }

  /**
   * Detect relationships during data processing (for TMDB/MAL data)
   */
  async detectRelationshipsFromExternalData(externalData, source) {
    const relationships = {
      sequels: [],
      prequels: [],
      related: [],
      franchise: null,
    }

    // Check if this content belongs to a known franchise
    const franchise = this.findFranchiseByExternalId(externalData, source)
    if (franchise) {
      relationships.franchise = franchise
    }

    return relationships
  }

  /**
   * Find franchise by external ID (TMDB or MAL)
   */
  findFranchiseByExternalId(externalData, source) {
    let externalId

    if (source === 'tmdb') {
      externalId = externalData.id
    } else {
      // For MAL, handle both raw API response and converted content
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
   * Find related content by title pattern during data processing
   */
  async findRelatedByTitlePattern(baseTitle) {
    // Find existing content with similar base titles
    const similarContent = await Content.find({
      $or: [
        { title: { $regex: `^${this.escapeRegex(baseTitle)}`, $options: 'i' } },
        { originalTitle: { $regex: `^${this.escapeRegex(baseTitle)}`, $options: 'i' } },
      ],
    }).limit(5)

    return similarContent
  }

  /**
   * Process relationships during content merging
   */
  async processRelationshipsDuringMerge(existingContent, newData, source) {
    // Detect relationships for the new data
    const newRelationships = await this.detectRelationshipsFromExternalData(newData, source)

    // Update existing content with relationship information
    if (newRelationships.franchise) {
      existingContent.franchise = newRelationships.franchise.name
    }

    // Store relationship metadata
    if (!existingContent.relationships) {
      existingContent.relationships = {
        sequels: [],
        prequels: [],
        related: [],
        franchise: null,
      }
    }

    // Merge relationship data
    if (newRelationships.franchise) {
      existingContent.relationships.franchise = newRelationships.franchise.name
    }

    return existingContent
  }

  /**
   * Extract base title from a title (remove numbers, parts, etc.)
   */
  extractBaseTitle(title) {
    if (!title) return null

    // Try different patterns
    for (const [, pattern] of Object.entries(this.relationshipPatterns)) {
      const match = title.match(pattern)
      if (match) {
        return match[1].trim()
      }
    }

    // If no pattern matches, return the original title
    return title.trim()
  }

  /**
   * Check if content belongs to a franchise
   */
  isInFranchise(title, franchiseTitles) {
    const titleLower = title.toLowerCase()
    return franchiseTitles.some((franchiseTitle) => {
      const franchiseLower = franchiseTitle.toLowerCase()
      // More strict matching: title must start with franchise name or contain it as a complete word
      return (
        titleLower === franchiseLower ||
        titleLower.startsWith(franchiseLower + ' ') ||
        titleLower.includes(' ' + franchiseLower + ' ') ||
        titleLower.endsWith(' ' + franchiseLower)
      )
    })
  }

  /**
   * Deduplicate related content
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
   * Categorize relationships as sequels, prequels, or related
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
   * Determine the relationship between two pieces of content
   */
  determineRelationship(original, related) {
    const originalYear = this.extractYear(original.releaseDate)
    const relatedYear = this.extractYear(related.releaseDate)

    if (!originalYear || !relatedYear) {
      return 'related'
    }

    // Simple heuristic: if related content is newer, it's a sequel
    // If it's older, it's a prequel
    if (relatedYear > originalYear) {
      return 'sequel'
    } else if (relatedYear < originalYear) {
      return 'prequel'
    }

    return 'related'
  }

  /**
   * Extract year from release date
   */
  extractYear(releaseDate) {
    if (!releaseDate) return null
    const date = new Date(releaseDate)
    return date.getFullYear()
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

export default new RelationshipService()
