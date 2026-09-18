/**
 * Mongoose schema for catalog people and studios (characters, voice actors, studios).
 * These are searchable, favoritable entities with their own screens, but they are
 * not Movies/TV catalog tabs and are excluded from watchlist ranking.
 */
import mongoose from 'mongoose'

const VoiceCreditSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    language: String,
    malId: Number,
    tmdbId: Number,
    imagePath: String,
    entity: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity' },
  },
  { _id: false },
)

const AppearanceSchema = new mongoose.Schema(
  {
    content: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Content',
      required: true,
    },
    role: {
      type: String,
      default: 'Supporting',
    },
    importance: {
      type: Number,
      default: 0,
    },
    characterName: String,
    voiceActors: [VoiceCreditSchema],
  },
  { _id: false },
)

const EntitySchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['character', 'voice_actor', 'studio'],
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      index: true,
    },
    englishName: String,
    nativeName: String,
    alternativeNames: [String],
    about: String,
    imagePath: String,
    malId: {
      type: Number,
      sparse: true,
    },
    tmdbId: {
      type: Number,
      sparse: true,
    },
    favoritesCount: {
      type: Number,
      default: 0,
    },
    lastSyncedAt: Date,
    appearances: [AppearanceSchema],
  },
  { timestamps: true },
)

EntitySchema.index(
  { entityType: 1, malId: 1 },
  {
    unique: true,
    name: 'entityType_malId_partial',
    partialFilterExpression: { malId: { $type: 'number', $gt: 0 } },
  },
)
EntitySchema.index({ entityType: 1, name: 1 })
EntitySchema.index({ 'appearances.content': 1, entityType: 1 })
EntitySchema.index({ name: 'text', englishName: 'text', nativeName: 'text', about: 'text' })

/**
 * Preferred on-screen name.
 * @returns {string}
 */
EntitySchema.virtual('displayName').get(function () {
  return this.englishName || this.name || this.nativeName || 'Unknown'
})

const Entity = mongoose.model('Entity', EntitySchema)

export default Entity
