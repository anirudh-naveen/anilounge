import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    // User Information
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
      minlength: [6, 'Password must be at least 6 characters long'],
    },

    // Watchlist information
    watchlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Content',
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

    // User preferences
    preferences: {
      favoriteGenres: [String],
      favoriteStudios: [String],
    },
  },

  {
    timestamps: true,
  },
)

// Hash password before saving it in database
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

// Checks if password matches hash
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const userObject = this.toObject()
  delete userObject.password
  return userObject
}

export default mongoose.model('User', userSchema)
