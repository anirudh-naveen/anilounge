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
      enum: ['movie', 'tv'],
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

    // External IDs
    tmdbId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },
    malId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },

    // Ratings and Popularity
    voteAverage: Number,
    voteCount: Number,
    popularity: Number,
    unifiedScore: Number, // Combined score from TMDB and MAL

    // MAL Specific Fields
    malScore: Number,
    malScoredBy: Number,
    malRank: Number,
    malStatus: {
      type: String,
      enum: ['finished_airing', 'currently_airing', 'not_yet_aired'],
    },
    malEpisodes: Number,
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

// Ensure at least one external ID exists
ContentSchema.pre('save', function (next) {
  if (!this.tmdbId && !this.malId) {
    return next(new Error('Content must have at least one external ID (tmdbId or malId)'))
  }
  next()
})

// Virtual for display title
ContentSchema.virtual('displayTitle').get(function () {
  return this.title || this.originalTitle || 'Unknown Title'
})

// Virtual for primary rating
ContentSchema.virtual('primaryRating').get(function () {
  if (this.malScore && this.malScoredBy > 100) {
    return {
      score: this.malScore,
      count: this.malScoredBy,
      source: 'mal',
    }
  }
  if (this.voteAverage && this.voteCount > 10) {
    return {
      score: this.voteAverage,
      count: this.voteCount,
      source: 'tmdb',
    }
  }
  return null
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
