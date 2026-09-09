import mongoose from 'mongoose'

const ContentSchema = new mongoose.Schema(
  {
    // Basic Information
    title: {
      type: String,
      required: true,
      index: true,
    },
    originalTitle: String,
    overview: String,
    tagline: String,

    // Content Type
    contentType: {
      type: String,
      enum: ['movie', 'tv', 'special'],
      required: true,
      index: true,
    },

    // Media Information
    posterPath: String,
    backdropPath: String,
    releaseDate: Date,
    runtime: Number, // For movies
    episodeCount: Number, // For TV shows
    seasonCount: Number, // For TV shows

    // Internal ID for unified content management
    internalId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    // External IDs (for reference only, not used for deduplication)
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

    // Ratings and Popularity
    voteAverage: Number,
    voteCount: Number,
    popularity: Number,
    unifiedScore: Number, // Vote-weighted average of MAL, TMDB, and Find Animation

    // User-generated ratings (from your app users)
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

    // MAL Specific Fields
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

    // Genres (unified from both sources)
    genres: [
      {
        id: Number,
        name: String,
      },
    ],

    // Studios/Production Companies
    studios: [String],
    productionCompanies: [String],

    // Alternative Titles
    alternativeTitles: [String],

    // Relationship Information
    franchise: String, // Name of the franchise this content belongs to
    relationships: {
      sequels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Content' }],
      prequels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Content' }],
      related: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Content' }],
      franchise: String, // Franchise name
    },

    // Data Source Tracking
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

    // Metadata
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

// Create compound indexes for efficient queries
ContentSchema.index({ contentType: 1, popularity: -1 })
ContentSchema.index({ contentType: 1, voteAverage: -1 })
ContentSchema.index({ contentType: 1, malScore: -1 })
ContentSchema.index({ contentType: 1, unifiedScore: -1 })
ContentSchema.index({ unifiedScore: -1, popularity: -1 })
ContentSchema.index({ genres: 1, contentType: 1 })
ContentSchema.index({ title: 'text', overview: 'text' })
// Indexes for relationship queries
ContentSchema.index({ contentType: 1, tmdbId: 1 })
ContentSchema.index({ contentType: 1, malId: 1 })
ContentSchema.index({ contentType: 1, title: 1 })
ContentSchema.index({ contentType: 1, originalTitle: 1 })

// Virtual for display title
ContentSchema.virtual('displayTitle').get(function () {
  return this.title || this.originalTitle || 'Unknown Title'
})

// Virtual for primary rating (vote-weighted average of available sources)
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

// Virtual for primary poster
ContentSchema.virtual('primaryPoster').get(function () {
  return this.posterPath || null
})

// Method to check if content is complete
ContentSchema.methods.isComplete = function () {
  return !!(this.title && this.overview && (this.posterPath || this.backdropPath))
}

// Method to get unified genres
ContentSchema.methods.getUnifiedGenres = function () {
  const genreMap = new Map()

  // Add TMDB genres
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

// Static method to find content by external ID
ContentSchema.statics.findByExternalId = function (id, source = 'tmdb') {
  const query = source === 'tmdb' ? { tmdbId: id } : { malId: id }
  return this.findOne(query)
}

// Static method to find similar content
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
