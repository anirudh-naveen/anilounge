/**
 * Mongoose schema for unified catalog titles (movies, TV, specials).
 * Models layer: identity, ratings from MAL/TMDB/Find Animation, and franchise relationships.
 * Exposes virtuals for display title and vote-weighted primary rating, plus lookup helpers.
 */
import mongoose from 'mongoose'

const ContentSchema = new mongoose.Schema(
  {
    // Identity
    title: {
      type: String,
      required: true,
      index: true,
    },
    englishTitle: String,
    nativeTitle: String,
    originalTitle: String, // Legacy alias of nativeTitle
    overview: String,
    tagline: String,

    contentType: {
      type: String,
      enum: ['movie', 'tv', 'special'],
      required: true,
      index: true,
    },

    // Presentation
    posterPath: String,
    backdropPath: String,
    releaseDate: Date,
    runtime: Number,
    episodeCount: Number,
    seasonCount: Number,

    internalId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    // External IDs are reference-only; catalog dedup is title/type based, not these IDs
    tmdbId: {
      type: Number,
      sparse: true,
      index: true,
    },
    malId: {
      type: Number,
      sparse: true,
      index: true,
    },

    // Ratings: TMDB votes, MAL scores, and in-app user ratings feed unifiedScore
    voteAverage: Number,
    voteCount: Number,
    popularity: Number,
    unifiedScore: Number, // Vote-weighted average of MAL, TMDB, and Find Animation

    userRatingAverage: {
      type: Number,
      default: null,
    },
    userRatingCount: {
      type: Number,
      default: 0,
    },
    userRatingSum: {
      type: Number,
      default: 0,
    },

    // MAL catalog fields (status, media type, source, age rating)
    malScore: Number,
    malScoredBy: Number,
    malRank: Number,
    malStatus: {
      type: String,
      enum: ['finished_airing', 'currently_airing', 'not_yet_aired'],
    },
    malEpisodes: Number,
    malMediaType: {
      type: String,
      enum: ['unknown', 'tv', 'ova', 'movie', 'special', 'ona', 'music'],
    },
    malSource: {
      type: String,
      enum: [
        'manga',
        'light_novel',
        'novel',
        'web_novel',
        'original',
        'game',
        '4_koma_manga',
        'web_manga',
        'music',
        'picture_book',
        'visual_novel',
        'other',
      ],
    },
    malRating: {
      type: String,
      enum: ['g', 'pg', 'pg_13', 'r', 'r+', 'rx'],
    },

    // Classification (genres merged from TMDB and MAL)
    genres: [
      {
        id: Number,
        name: String,
      },
    ],

    studios: [String],
    productionCompanies: [String],

    alternativeTitles: [String],

    // Relationships
    franchise: String,
    relationships: {
      sequels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Content' }],
      prequels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Content' }],
      related: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Content' }],
      franchise: String,
    },

    // Provenance
    dataSources: {
      tmdb: {
        hasData: { type: Boolean, default: false },
        lastUpdated: Date,
      },
      mal: {
        hasData: { type: Boolean, default: false },
        lastUpdated: Date,
      },
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

ContentSchema.index({ contentType: 1, popularity: -1 })
ContentSchema.index({ contentType: 1, voteAverage: -1 })
ContentSchema.index({ contentType: 1, malScore: -1 })
ContentSchema.index({ contentType: 1, unifiedScore: -1 })
ContentSchema.index({ unifiedScore: -1, popularity: -1 })
ContentSchema.index({ genres: 1, contentType: 1 })
ContentSchema.index({ title: 'text', overview: 'text' })
ContentSchema.index({ contentType: 1, tmdbId: 1 })
ContentSchema.index({ contentType: 1, malId: 1 })
ContentSchema.index({ contentType: 1, title: 1 })
ContentSchema.index({ contentType: 1, englishTitle: 1 })
ContentSchema.index({ contentType: 1, nativeTitle: 1 })
ContentSchema.index({ contentType: 1, originalTitle: 1 })

/**
 * Preferred on-screen title: English, then canonical, then native/legacy.
 * @returns {string}
 */
ContentSchema.virtual('displayTitle').get(function () {
  return this.englishTitle || this.title || this.nativeTitle || this.originalTitle || 'Unknown Title'
})

/**
 * Vote-weighted average across MAL, TMDB, and Find Animation; omits sources with no voters.
 * @returns {{ score: number, count: number, source: string } | null}
 */
ContentSchema.virtual('primaryRating').get(function () {
  const sources = []
  if (this.malScore && this.malScoredBy > 0) {
    sources.push({ score: this.malScore, count: this.malScoredBy, source: 'mal' })
  }
  if (this.voteAverage && this.voteCount > 0) {
    sources.push({ score: this.voteAverage, count: this.voteCount, source: 'tmdb' })
  }
  if (this.userRatingAverage && this.userRatingCount > 0) {
    sources.push({
      score: this.userRatingAverage,
      count: this.userRatingCount,
      source: 'findanimation',
    })
  }
  if (sources.length === 0) return null

  const totalCount = sources.reduce((sum, source) => sum + source.count, 0)
  const score =
    totalCount > 0
      ? sources.reduce((sum, source) => sum + source.score * source.count, 0) / totalCount
      : sources[0].score

  return {
    score,
    count: totalCount,
    source: sources.length === 1 ? sources[0].source : 'combined',
  }
})

/**
 * Poster path when present; callers still prefix the image CDN.
 * @returns {string | null}
 */
ContentSchema.virtual('primaryPoster').get(function () {
  return this.posterPath || null
})

/**
 * Whether the document has enough fields to show a detail card.
 * @returns {boolean}
 */
ContentSchema.methods.isComplete = function () {
  return !!(this.title && this.overview && (this.posterPath || this.backdropPath))
}

/**
 * Deduplicate genre objects/strings by lowercase name.
 * @returns {Array<{ id?: number, name: string }>}
 */
ContentSchema.methods.getUnifiedGenres = function () {
  const genreMap = new Map()

  if (this.genres && Array.isArray(this.genres)) {
    this.genres.forEach((genre) => {
      if (typeof genre === 'object' && genre.name) {
        genreMap.set(genre.name.toLowerCase(), genre)
      } else if (typeof genre === 'string') {
        genreMap.set(genre.toLowerCase(), { name: genre })
      }
    })
  }

  return Array.from(genreMap.values())
}

/**
 * Look up a catalog row by TMDB or MAL id (reference lookup, not dedup).
 * @param {number} id - External numeric id
 * @param {'tmdb' | 'mal'} [source='tmdb']
 * @returns {Promise<import('mongoose').Document | null>}
 */
ContentSchema.statics.findByExternalId = function (id, source = 'tmdb') {
  const query = source === 'tmdb' ? { tmdbId: id } : { malId: id }
  return this.findOne(query)
}

/**
 * Same type and overlapping genres, ranked by popularity.
 * @param {{ _id: unknown, contentType: string, genres?: Array }} content
 * @param {number} [limit=10]
 * @returns {import('mongoose').Query}
 */
ContentSchema.statics.findSimilar = function (content, limit = 10) {
  const genreIds = content.genres ? content.genres.map((g) => g.id || g) : []

  return this.find({
    _id: { $ne: content._id },
    contentType: content.contentType,
    genres: { $in: genreIds },
  })
    .sort({ popularity: -1 })
    .limit(limit)
}

const Content = mongoose.model('Content', ContentSchema)

export default Content
