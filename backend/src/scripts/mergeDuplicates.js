/**
 * Merge catalog rows that are the same title from different sources, then delete extras.
 * Groups by exact English/native/original/alternative names on the same contentType.
 * Skips a group when it contains more than one TMDB id or more than one MAL id.
 * Rewrites watchlist, ratings, and relationship pointers onto the kept row.
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Content from '../models/Content.js'
import User from '../models/User.js'
import { applyTitleFields } from '../utils/titles.js'
import { calculateUnifiedScore } from '../utils/ratings.js'

dotenv.config()

function titleKeys(item) {
  return [item.englishTitle, item.title, item.nativeTitle, item.originalTitle]
    .map((title) => (typeof title === 'string' ? title.trim().toLowerCase() : ''))
    .filter(Boolean)
}

function groupBySharedTitles(allContent) {
  const parent = allContent.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const keyToIndex = new Map()
  allContent.forEach((item, index) => {
    for (const title of titleKeys(item)) {
      const key = `${item.contentType}::${title}`
      const existing = keyToIndex.get(key)
      if (existing != null) union(existing, index)
      else keyToIndex.set(key, index)
    }
  })

  const groups = new Map()
  allContent.forEach((item, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(item)
  })
  return [...groups.values()].filter((items) => items.length > 1)
}

function uniquePositiveIds(items, field) {
  return [
    ...new Set(
      items
        .map((item) => Number(item[field]))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ]
}

function isSafeMergeGroup(items) {
  if (uniquePositiveIds(items, 'tmdbId').length > 1) return false
  if (uniquePositiveIds(items, 'malId').length > 1) return false

  const years = items
    .map((item) => (item.releaseDate ? new Date(item.releaseDate).getFullYear() : null))
    .filter((year) => Number.isFinite(year))
  if (years.length >= 2) {
    const maxYearDiff = items[0].contentType === 'movie' ? 2 : 3
    if (Math.max(...years) - Math.min(...years) > maxYearDiff) return false
  }

  return true
}

function completeness(item) {
  return (
    (item.tmdbId ? 2 : 0) +
    (item.malId ? 2 : 0) +
    (item.overview ? 1 : 0) +
    (item.posterPath ? 1 : 0) +
    (item.unifiedScore || 0)
  )
}

function pickPrimary(items) {
  return [...items].sort((a, b) => completeness(b) - completeness(a))[0]
}

function assignTitleFields(doc, titleFields) {
  doc.title = titleFields.title
  if (titleFields.englishTitle) doc.englishTitle = titleFields.englishTitle
  if (titleFields.nativeTitle) doc.nativeTitle = titleFields.nativeTitle
  if (titleFields.originalTitle) doc.originalTitle = titleFields.originalTitle
  doc.alternativeTitles = titleFields.alternativeTitles
}

function mergeSecondaryIntoPrimary(primary, secondary) {
  assignTitleFields(primary, applyTitleFields(primary, secondary))

  if (!primary.tmdbId && secondary.tmdbId) primary.tmdbId = secondary.tmdbId
  if (!primary.malId && secondary.malId) primary.malId = secondary.malId
  if (!primary.overview || (secondary.overview && secondary.overview.length > primary.overview.length)) {
    primary.overview = secondary.overview
  }
  if (!primary.posterPath && secondary.posterPath) primary.posterPath = secondary.posterPath
  if (!primary.backdropPath && secondary.backdropPath) primary.backdropPath = secondary.backdropPath
  if (!primary.releaseDate && secondary.releaseDate) primary.releaseDate = secondary.releaseDate
  if (primary.runtime == null && secondary.runtime != null) primary.runtime = secondary.runtime
  if (primary.episodeCount == null && secondary.episodeCount != null) {
    primary.episodeCount = secondary.episodeCount
  }
  if (primary.seasonCount == null && secondary.seasonCount != null) {
    primary.seasonCount = secondary.seasonCount
  }
  if (!primary.voteAverage && secondary.voteAverage) primary.voteAverage = secondary.voteAverage
  if (!primary.voteCount && secondary.voteCount) primary.voteCount = secondary.voteCount
  if (!primary.popularity && secondary.popularity) primary.popularity = secondary.popularity
  if (!primary.malScore && secondary.malScore) primary.malScore = secondary.malScore
  if (!primary.malScoredBy && secondary.malScoredBy) primary.malScoredBy = secondary.malScoredBy
  if (!primary.malRank && secondary.malRank) primary.malRank = secondary.malRank
  if (!primary.malStatus && secondary.malStatus) primary.malStatus = secondary.malStatus
  if (!primary.malEpisodes && secondary.malEpisodes) primary.malEpisodes = secondary.malEpisodes
  if (!primary.malMediaType && secondary.malMediaType) primary.malMediaType = secondary.malMediaType
  if (!primary.broadcastDay && secondary.broadcastDay) primary.broadcastDay = secondary.broadcastDay
  if (!primary.broadcastTime && secondary.broadcastTime) primary.broadcastTime = secondary.broadcastTime

  primary.studios = [...new Set([...(primary.studios || []), ...(secondary.studios || [])])]
  primary.originCountries = [
    ...new Set([...(primary.originCountries || []), ...(secondary.originCountries || [])]),
  ]
  const genreMap = new Map()
  for (const genre of [...(primary.genres || []), ...(secondary.genres || [])]) {
    const name = typeof genre === 'object' ? genre.name : genre
    if (!name) continue
    const key = String(name).toLowerCase()
    if (!genreMap.has(key)) genreMap.set(key, typeof genre === 'object' ? genre : { name })
  }
  primary.genres = [...genreMap.values()]

  if (!primary.dataSources) primary.dataSources = {}
  if (secondary.dataSources?.tmdb && !primary.dataSources.tmdb) {
    primary.dataSources.tmdb = secondary.dataSources.tmdb
  }
  if (secondary.dataSources?.mal && !primary.dataSources.mal) {
    primary.dataSources.mal = secondary.dataSources.mal
  }

  primary.unifiedScore =
    calculateUnifiedScore(
      primary.voteAverage,
      primary.voteCount,
      primary.malScore,
      primary.malScoredBy,
      primary.userRatingAverage,
      primary.userRatingCount,
    ) ||
    primary.malScore ||
    primary.voteAverage ||
    primary.unifiedScore ||
    0

  primary.lastUpdated = new Date()
}

async function retargetUsers(fromId, toId) {
  const users = await User.find({
    $or: [{ 'watchlist.content': fromId }, { 'ratings.content': fromId }],
  })

  for (const user of users) {
    const hasWatch = user.watchlist.some((item) => item.content && item.content.equals(toId))
    user.watchlist = user.watchlist.filter((item) => {
      if (!item.content || !item.content.equals(fromId)) return true
      if (hasWatch) return false
      item.content = toId
      return true
    })

    const hasRating = user.ratings.some((item) => item.content && item.content.equals(toId))
    user.ratings = user.ratings.filter((item) => {
      if (!item.content || !item.content.equals(fromId)) return true
      if (hasRating) return false
      item.content = toId
      return true
    })

    await user.save()
  }
}

async function retargetRelationships(fromId, toId) {
  const docs = await Content.find({
    $or: [
      { 'relationships.sequels': fromId },
      { 'relationships.prequels': fromId },
      { 'relationships.related': fromId },
    ],
  })

  for (const doc of docs) {
    for (const field of ['sequels', 'prequels', 'related']) {
      const list = doc.relationships?.[field]
      if (!Array.isArray(list)) continue
      doc.relationships[field] = [
        ...new Set(
          list.map((id) => (id.equals(fromId) ? toId.toString() : id.toString())),
        ),
      ]
    }
    await doc.save()
  }
}

async function mergeDuplicates() {
  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Database connected')

  const allContent = await Content.find({}).lean()
  const groups = groupBySharedTitles(allContent)
  const safeGroups = groups.filter(isSafeMergeGroup)

  console.log(`Found ${groups.length} same-name groups, ${safeGroups.length} safe to merge`)

  let mergedGroups = 0
  let deleted = 0

  for (const group of safeGroups) {
    const primaryMeta = pickPrimary(group)
    const primary = await Content.findById(primaryMeta._id)
    if (!primary) continue

    const secondaries = group.filter((item) => !item._id.equals(primary._id))
    console.log(
      `\nKeeping "${primary.title}" (${primary._id}) and merging ${secondaries.length} duplicate(s)`,
    )

    for (const secondaryMeta of secondaries) {
      const secondary = await Content.findById(secondaryMeta._id)
      if (!secondary) continue

      mergeSecondaryIntoPrimary(primary, secondary)
      await retargetUsers(secondary._id, primary._id)
      await retargetRelationships(secondary._id, primary._id)
      await Content.findByIdAndDelete(secondary._id)
      deleted++
      console.log(`  deleted "${secondary.title}" (${secondary._id})`)
    }

    await primary.save()
    mergedGroups++
  }

  const skipped = groups.length - safeGroups.length
  console.log(`\nMerged ${mergedGroups} groups, deleted ${deleted} duplicate rows, skipped ${skipped} ambiguous groups`)

  await mongoose.disconnect()
  console.log('Database disconnected')
}

mergeDuplicates().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
