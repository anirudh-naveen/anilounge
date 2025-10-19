import mongoose from 'mongoose'

const contentSchema = new mongoose.Schema(
  {
    tmdbId: {
      type: Number,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    originalTitle: {
      type: String,
      trim: true,
    },
    overview: {
      type: String,
      trim: true,
    },
    posterPath: {
      type: String,
    },
    backdropPath: {
      type: String,
    },
    releaseDate: {
      type: Date,
    },
    contentType: {
      type: String,
      enum: ['movie', 'tv'],
      required: true,
    },
    genres: [
      {
        id: Number,
        name: String,
      },
    ],
    adult: {
      type: Boolean,
      default: false,
    },
    originalLanguage: {
      type: String,
      default: 'en',
    },
    popularity: {
      type: Number,
      default: 0,
    },
    voteAverage: {
      type: Number,
      default: 0,
    },
    voteCount: {
      type: Number,
      default: 0,
    },
    runtime: {
      type: Number, // in minutes
    },
    status: {
      type: String, // for TV shows: 'Returning Series', 'Ended', etc.
    },
    numberOfSeasons: {
      type: Number,
    },
    numberOfEpisodes: {
      type: Number,
    },
    networks: [
      {
        id: Number,
        name: String,
        logoPath: String,
      },
    ],
    productionCompanies: [
      {
        id: Number,
        name: String,
        logoPath: String,
      },
    ],
    productionCountries: [
      {
        iso_3166_1: String,
        name: String,
      },
    ],
    spokenLanguages: [
      {
        iso_639_1: String,
        name: String,
      },
    ],
    tagline: {
      type: String,
    },
    homepage: {
      type: String,
    },
    imdbId: {
      type: String,
    },
    // Custom field to delineate animations
    isAnimated: {
      type: Boolean,
      default: true,
    },
    animationStudio: {
      type: String,
    },
    animationType: {
      type: String,
      enum: ['2D', '3D', 'Stop Motion', 'Mixed', 'Unknown'],
      default: 'Unknown',
    },
    ageRating: {
      type: String,
      enum: ['G', 'PG', 'PG-13', 'R', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'],
      default: 'PG',
    },
    // Aggregated ratings from users
    averageUserRating: {
      type: Number,
      default: 0,
    },
    totalUserRatings: {
      type: Number,
      default: 0,
    },
    // Last updated from TMDB
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

// Index for efficient queries
contentSchema.index({ contentType: 1 })
contentSchema.index({ isAnimated: 1 })
contentSchema.index({ 'genres.name': 1 })
contentSchema.index({ averageUserRating: -1 })
contentSchema.index({ popularity: -1 })

export default mongoose.model('Content', contentSchema)
