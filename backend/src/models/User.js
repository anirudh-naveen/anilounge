/**
 * Mongoose schema for app accounts.
 * Models layer: identity, login lockout, watchlist entries, and per-title ratings.
 * Password is hashed on save and stripped from JSON serialization.
 */
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

/** Shared recruiter demo account. Password changes are blocked for this email. */
export const DEMO_USER_EMAIL = 'demo@findanimation.com'

const userSchema = new mongoose.Schema(
  {
    // Identity
    username: {
      type: String,
      required: [true, 'Please provide a username'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long'],
      maxlength: [20, 'Username cannot exceed 30 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please enter your email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Please enter a password'],
      minlength: [8, 'Password must be at least 8 characters long'],
      validate: {
        validator: function (password) {
          // Uppercase, lowercase, digit, and special character required
          const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
          return passwordRegex.test(password)
        },
        message:
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      },
    },
    profilePicture: {
      type: String,
      default: null,
    },
    isDemoAccount: {
      type: Boolean,
      default: false,
    },

    // Security (lockout after failed logins)
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    lastLogin: {
      type: Date,
    },

    // Watchlist and ratings
    watchlist: [
      {
        content: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Content',
        },
        status: {
          type: String,
          enum: ['plan_to_watch', 'watching', 'completed', 'dropped'],
          default: 'plan_to_watch',
        },
        rating: {
          type: Number,
          min: 1,
          max: 10,
        },
        currentEpisode: {
          type: Number,
          default: 0,
        },
        totalEpisodes: {
          type: Number,
        },
        currentSeason: {
          type: Number,
          default: 1,
        },
        totalSeasons: {
          type: Number,
        },
        notes: {
          type: String,
          maxlength: 500,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    ratings: [
      {
        content: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Content',
        },
        rating: {
          type: Number,
          min: 1,
          max: 10,
          required: true,
        },
        review: {
          type: String,
          maxlength: 1000,
        },
        watchedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Preferences
    preferences: {
      favoriteGenres: [String],
      favoriteStudios: [String],
    },

    // Favorited characters, voice actors, and studios (not watchlist titles)
    favoriteEntities: [
      {
        entity: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Entity',
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },

  {
    timestamps: true,
  },
)

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

/**
 * Compare a plaintext candidate against the stored bcrypt hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

/**
 * Whether this is the shared recruiter demo account (password changes are blocked).
 * Matches the stored flag or the canonical demo email so existing accounts still count.
 * @returns {boolean}
 */
userSchema.methods.isDemo = function () {
  return this.isDemoAccount === true || this.email === DEMO_USER_EMAIL
}

/**
 * Serialize without the password hash. `isDemoAccount` is derived so clients
 * can hide password changes even when the stored flag was never backfilled.
 * @returns {object}
 */
userSchema.methods.toJSON = function () {
  const userObject = this.toObject()
  delete userObject.password
  userObject.isDemoAccount = this.isDemo()
  return userObject
}

export default mongoose.model('User', userSchema)
