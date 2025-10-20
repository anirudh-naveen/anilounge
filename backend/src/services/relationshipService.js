import Content from '../models/Content.js'

class RelationshipService {
  constructor() {
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
    }
  }

  /**
   * Find related content based on title patterns and franchises
   */
  async findRelatedContent(contentId) {
    try {
      const content = await Content.findById(contentId)
      if (!content) {
        return { sequels: [], prequels: [], related: [] }
      }

      const relatedContent = await this.findByPatterns(content)
      const franchiseContent = await this.findByFranchise(content)

      // Combine and deduplicate results
      const allRelated = [...relatedContent, ...franchiseContent]
      const uniqueRelated = this.deduplicateRelated(allRelated, content)

      return this.categorizeRelationships(uniqueRelated, content)
    } catch (error) {
      console.error('Error finding related content:', error)
      return { sequels: [], prequels: [], related: [] }
    }
  }

  /**
   * Find related content based on title patterns
   */
  async findByPatterns(content) {
    const related = []
    const baseTitle = this.extractBaseTitle(content.title)

    if (!baseTitle) return related

    // Find content with similar base titles
    const similarContent = await Content.find({
      _id: { $ne: content._id },
      contentType: content.contentType,
      $or: [
        { title: { $regex: `^${this.escapeRegex(baseTitle)}`, $options: 'i' } },
        { originalTitle: { $regex: `^${this.escapeRegex(baseTitle)}`, $options: 'i' } },
      ],
    }).limit(10)

    return similarContent
  }

  /**
   * Find related content based on known franchises using enhanced mapping
   */
  async findByFranchise(content) {
    const related = []

    for (const [, franchiseData] of Object.entries(this.franchiseMap)) {
      if (this.isInFranchise(content.title, franchiseData.titles)) {
        // Search by titles
        const titleMatches = await Content.find({
          _id: { $ne: content._id },
          contentType: content.contentType,
          $or: franchiseData.titles.map((title) => ({
            $or: [
              { title: { $regex: this.escapeRegex(title), $options: 'i' } },
              { originalTitle: { $regex: this.escapeRegex(title), $options: 'i' } },
            ],
          })),
        }).limit(10)

        // Search by TMDB IDs
        const tmdbMatches = await Content.find({
          _id: { $ne: content._id },
          contentType: content.contentType,
          tmdbId: { $in: franchiseData.tmdbIds },
        }).limit(10)

        // Search by MAL IDs
        const malMatches = await Content.find({
          _id: { $ne: content._id },
          contentType: content.contentType,
          malId: { $in: franchiseData.malIds },
        }).limit(10)

        related.push(...titleMatches, ...tmdbMatches, ...malMatches)
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
