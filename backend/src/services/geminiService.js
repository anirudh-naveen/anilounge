/**
 * Gemini client for search-query expansion and catalog-grounded chat.
 * Domain service: wraps google generative AI with timeouts and local genre fallbacks.
 * Chat must look up Mongo Content via tools; replies never invent titles.
 * Custom model training does not belong in this product repo.
 *
 * API reference: https://ai.google.dev/gemini-api/docs
 */
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import dotenv from 'dotenv'
import {
  buildSystemInstruction,
  fallbackChatReply,
  getFunctionCalls,
  getResponseText,
  toGeminiHistory,
} from '../utils/geminiChat.js'
import { inferCatalogFiltersFromMessage, hasCatalogIntent } from '../utils/catalogChatQuery.js'
import { withRecommendationWhy } from '../utils/recommendationWhy.js'
import { sortByRecommendationRank } from '../utils/recommendationRank.js'
import {
  findByTitle,
  searchCatalog,
  serializeCatalogDoc,
  summarizeForModel,
} from './catalogLookupService.js'
import { lookupPublicInfo } from './publicInfoLookupService.js'

dotenv.config()

const CHAT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'search_catalog',
        description:
          'Search the AniLounge animated catalog. Call this before recommending titles. Only returned titles exist in the app. Results are ranked by genre match, then animation studio, then rating.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: 'Title keywords, themes, or character names',
            },
            contentType: {
              type: SchemaType.STRING,
              enum: ['all', 'movie', 'tv'],
              description: 'movie includes theatrical films and specials',
            },
            genre: { type: SchemaType.STRING, description: 'Single genre name such as Action' },
            studio: { type: SchemaType.STRING, description: 'Animation studio name' },
            originCountry: {
              type: SchemaType.STRING,
              description: 'ISO 3166-1 alpha-2 code such as JP, US, KR',
            },
            status: {
              type: SchemaType.STRING,
              enum: ['all', 'airing', 'upcoming', 'completed'],
            },
            season: {
              type: SchemaType.STRING,
              enum: ['winter', 'spring', 'summer', 'fall'],
            },
            year: { type: SchemaType.NUMBER, description: 'Calendar year' },
            minRating: {
              type: SchemaType.NUMBER,
              description:
                'Minimum unified score 1-10. Only set this when the user asked for highly rated or top titles.',
            },
            similarTo: {
              type: SchemaType.STRING,
              description: 'Find catalog titles similar to this title',
            },
            limit: { type: SchemaType.NUMBER, description: 'Max titles, default 8' },
          },
        },
      },
      {
        name: 'get_title_details',
        description:
          'Look up one catalog title by name and return overview, studios, genres, ratings, and airing info.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING, description: 'Title to look up' },
          },
          required: ['title'],
        },
      },
      {
        name: 'lookup_public_info',
        description:
          'Fetch a short Wikipedia summary for an animated movie/series already in the catalog, an animation studio, a voice actor, or a genre. Never use this for unrelated topics or to discover titles to recommend.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: 'Title, studio, voice actor, or genre name',
            },
            title: {
              type: SchemaType.STRING,
              description: 'Alias of name for catalog titles',
            },
            kind: {
              type: SchemaType.STRING,
              enum: ['title', 'studio', 'voice_actor', 'genre'],
              description: 'What the name refers to',
            },
          },
        },
      },
    ],
  },
]

class GeminiService {
  constructor() {
    this.client = null
    this.hasApiKey = !!process.env.GEMINI_API_KEY

    console.log('Gemini Service initialized:', {
      hasApiKey: this.hasApiKey,
      apiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    })

    if (this.hasApiKey) {
      this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    }
  }

  /**
   * Race a promise against a timeout.
   * @param {Promise} promise
   * @param {number} [ms=10000]
   * @returns {Promise}
   */
  withTimeout(promise, ms = 10000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini API timeout')), ms)),
    ])
  }

  /**
   * gemini-2.5-flash generateContent racing a 10s timeout.
   * @param {string} prompt
   * @returns {Promise<object>}
   * @throws {Error} When the API key is missing or the call times out
   */
  async makeApiCall(prompt) {
    console.log('makeApiCall called with prompt length:', prompt.length)

    if (!this.hasApiKey || !this.client) {
      console.log('API not available - hasApiKey:', this.hasApiKey, 'client:', !!this.client)
      throw new Error('Gemini API not available')
    }

    const model = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' })
    console.log('Model created, making API call...')

    return this.withTimeout(model.generateContent(prompt), 10000)
  }

  /**
   * Suggest extra search terms for animated content. Queries shorter than 3 chars skip the API.
   * @param {string} userQuery
   * @returns {Promise<{ refinedQuery: string, suggestedGenres: string[], recommendations: unknown[], searchSuggestions: string[] }>}
   */
  async enhanceSearchQuery(userQuery) {
    try {
      if (!this.hasApiKey || userQuery.length < 3) {
        return {
          refinedQuery: userQuery,
          suggestedGenres: [],
          recommendations: [],
          searchSuggestions: this.generateSimpleSuggestions(userQuery),
        }
      }

      const prompt = `Query: "${userQuery}"

Suggest 3-5 better search terms for finding animated content. Focus on:
- Genre names (action, comedy, fantasy, etc.)
- Popular anime titles
- Animation studios
- Character types

Respond as simple comma-separated terms: term1, term2, term3`

      const response = await this.makeApiCall(prompt)
      const suggestions = response.response
        .text()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      return {
        refinedQuery: userQuery,
        suggestedGenres: this.extractGenresFromQuery(userQuery),
        recommendations: [],
        searchSuggestions: suggestions,
      }
    } catch (error) {
      console.error('Gemini API error:', error)
      return {
        refinedQuery: userQuery,
        suggestedGenres: this.extractGenresFromQuery(userQuery),
        recommendations: [],
        searchSuggestions: this.generateSimpleSuggestions(userQuery),
      }
    }
  }

  /**
   * Keyword-based suggestion list used when Gemini is unavailable.
   * @param {string} query
   * @returns {string[]}
   */
  generateSimpleSuggestions(query) {
    const queryLower = query.toLowerCase()
    const suggestions = []

    if (queryLower.includes('action')) {
      suggestions.push('adventure anime', 'shounen', 'fighting anime', 'superhero anime')
    }
    if (queryLower.includes('comedy')) {
      suggestions.push('slice of life', 'romantic comedy', 'school comedy', 'gag anime')
    }
    if (queryLower.includes('anime')) {
      suggestions.push('japanese animation', 'manga adaptation', 'studio ghibli', 'popular anime')
    }
    if (queryLower.includes('fantasy')) {
      suggestions.push('magic anime', 'isekai', 'adventure fantasy', 'medieval fantasy')
    }

    return suggestions.slice(0, 5)
  }

  /**
   * Map query substrings onto TMDB-style genre names.
   * @param {string} query
   * @returns {string[]}
   */
  extractGenresFromQuery(query) {
    const genreMap = {
      action: 'Action',
      adventure: 'Adventure',
      comedy: 'Comedy',
      drama: 'Drama',
      fantasy: 'Fantasy',
      horror: 'Horror',
      romance: 'Romance',
      'sci-fi': 'Science Fiction',
      thriller: 'Thriller',
      family: 'Family',
    }

    const queryLower = query.toLowerCase()
    return Object.keys(genreMap)
      .filter((genre) => queryLower.includes(genre))
      .map((genre) => genreMap[genre])
  }

  catalogSearchFilters(args = {}, userContext = null) {
    return {
      ...args,
      excludeIds: userContext?.excludeIds || [],
      favoriteGenres: userContext?.favoriteGenres || [],
      favoriteStudios: userContext?.favoriteStudios || [],
    }
  }

  rankChatResults(docs, filters = {}, userContext = null) {
    const context = {
      ...filters,
      favoriteGenres: userContext?.favoriteGenres || filters.favoriteGenres || [],
      favoriteStudios: userContext?.favoriteStudios || filters.favoriteStudios || [],
    }
    return withRecommendationWhy(sortByRecommendationRank(docs, context), context)
  }

  /**
   * Run a catalog tool and return both UI documents and a compact model payload.
   * @param {string} name
   * @param {object} args
   * @param {object|null} [userContext]
   * @returns {Promise<{ docs: object[], payload: object }>}
   */
  async executeCatalogTool(name, args = {}, userContext = null) {
    const filters = this.catalogSearchFilters(args, userContext)
    if (name === 'get_title_details') {
      const doc = await findByTitle(args.title)
      const explained = withRecommendationWhy(doc ? [doc] : [], { lookupTitle: args.title })
      return {
        docs: explained,
        payload: explained[0]
          ? summarizeForModel(explained[0], { fullOverview: true })
          : { found: false, message: 'No catalog title matched that name.' },
      }
    }
    if (name === 'search_catalog') {
      const docs = this.rankChatResults(await searchCatalog(filters), filters, userContext)
      return {
        docs,
        payload: { count: docs.length, titles: docs.map((doc) => summarizeForModel(doc)) },
      }
    }
    if (name === 'lookup_public_info') {
      const { docs, payload } = await lookupPublicInfo({
        name: args.name,
        title: args.title,
        kind: args.kind,
      })
      const context = {
        studio: args.kind === 'studio' ? args.name || args.title : undefined,
        genre: args.kind === 'genre' ? args.name || args.title : undefined,
        lookupTitle: args.kind === 'title' || !args.kind ? args.name || args.title : undefined,
      }
      return { docs: this.rankChatResults(docs, context, userContext), payload }
    }
    return { docs: [], payload: { error: `Unknown tool: ${name}` } }
  }

  /**
   * Catalog search used by `/ai-search` and as a Gemini-less chat fallback.
   * @param {string} query
   * @param {object} [extraFilters]
   * @returns {Promise<object[]>}
   */
  async searchContent(query, extraFilters = {}) {
    const filters = {
      ...inferCatalogFiltersFromMessage(query),
      ...extraFilters,
    }
    const docs = await searchCatalog(filters)
    return docs.map(serializeCatalogDoc)
  }

  async groundedCatalogReply(message, userContext) {
    const filters = inferCatalogFiltersFromMessage(message)
    const docs = hasCatalogIntent(message)
      ? this.rankChatResults(
          await searchCatalog(this.catalogSearchFilters(filters, userContext)),
          filters,
          userContext,
        )
      : []
    return {
      response: hasCatalogIntent(message)
        ? fallbackChatReply(docs)
        : 'I can help with animated movies, series, studios, voice actors, and genres in the AniLounge catalog.',
      results: docs.map(serializeCatalogDoc),
      searchSuggestion: null,
    }
  }

  /**
   * Conversational assistant grounded in the Mongo catalog via Gemini function calls.
   * @param {string} userMessage
   * @param {{ history?: object[], userContext?: object|null }} [options]
   * @returns {Promise<{ response: string, results: object[], searchSuggestion: string | null }>}
   */
  async chatWithUser(userMessage, { history = [], userContext = null } = {}) {
    const message = String(userMessage || '').trim()
    if (!message) {
      return {
        response: 'Ask about an animated movie, series, studio, voice actor, or genre.',
        results: [],
        searchSuggestion: null,
      }
    }

    if (!this.hasApiKey || !this.client) {
      return this.groundedCatalogReply(message, userContext)
    }

    try {
      const found = new Map()
      const model = this.client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        tools: CHAT_TOOLS,
        systemInstruction: buildSystemInstruction(userContext),
      })
      const chat = model.startChat({ history: toGeminiHistory(history) })
      let result = await this.withTimeout(chat.sendMessage(message), 20000)
      let response = result.response

      let publicLookups = 0
      for (let round = 0; round < 4; round += 1) {
        const calls = getFunctionCalls(response)
        if (!calls.length) break
        const functionResponses = []
        for (const call of calls) {
          if (call.name === 'lookup_public_info') {
            publicLookups += 1
            if (publicLookups > 2) {
              functionResponses.push({
                functionResponse: {
                  name: call.name,
                  response: {
                    allowed: false,
                    reason: 'Public lookup limit reached for this turn. Use catalog fields.',
                  },
                },
              })
              continue
            }
          }
          const { docs, payload } = await this.executeCatalogTool(call.name, call.args, userContext)
          for (const doc of docs) {
            found.set(String(doc._id), doc)
          }
          functionResponses.push({
            functionResponse: { name: call.name, response: payload },
          })
        }
        result = await this.withTimeout(chat.sendMessage(functionResponses), 20000)
        response = result.response
      }

      let results = [...found.values()]
      const filters = inferCatalogFiltersFromMessage(message)
      if (!results.length && hasCatalogIntent(message)) {
        results = await searchCatalog(this.catalogSearchFilters(filters, userContext))
      }
      results = this.rankChatResults(results, filters, userContext)

      const text = getResponseText(response) || fallbackChatReply(results)
      return {
        response: text,
        results: results.map(serializeCatalogDoc),
        searchSuggestion: null,
      }
    } catch (error) {
      console.error('Gemini chat error:', error)
      return this.groundedCatalogReply(message, userContext)
    }
  }

  /**
   * Ask Gemini to pick titles from a preference object plus a content slice.
   * @param {object} userPreferences
   * @param {object[]} availableContent
   * @returns {Promise<{ recommendations: Array<{ title: string, reason: string, matchScore: number }> }>}
   */
  async generateRecommendations(userPreferences, availableContent) {
    try {
      const prompt = `You are an AI assistant that recommends animated movies and series.

User preferences: ${JSON.stringify(userPreferences)}

Available content (first 20 items):
${JSON.stringify(availableContent.slice(0, 20), null, 2)}

Based on the user's preferences and available content, recommend 5-10 items that would be a good match.

Respond in JSON format:
{
  "recommendations": [
    {
      "title": "content title",
      "reason": "detailed explanation of why this is recommended",
      "matchScore": 0.95
    }
  ]
}`

      const response = await this.makeApiCall(prompt)
      const content = response.response.text()
      return JSON.parse(content)
    } catch (error) {
      console.error('Gemini recommendation error:', error)
      return { recommendations: [] }
    }
  }

  /**
   * Extract themes, audience, mood, and tags from a catalog row.
   * @param {{ title: string, overview?: string, genres?: string[] }} content
   * @returns {Promise<{ keyThemes: string[], targetAudience: string, mood: string, similarContent: string[], tags: string[] }>}
   */
  async analyzeContent(content) {
    try {
      const prompt = `Analyze this animated content and extract key features:

Title: ${content.title}
Overview: ${content.overview}
Genres: ${content.genres?.join(', ') || 'Unknown'}

Extract and return in JSON format:
{
  "keyThemes": ["theme1", "theme2"],
  "targetAudience": "audience description",
  "mood": "mood description",
  "similarContent": ["similar title1", "similar title2"],
  "tags": ["tag1", "tag2", "tag3"]
}`

      const response = await this.makeApiCall(prompt)
      const responseContent = response.response.text()
      return JSON.parse(responseContent)
    } catch (error) {
      console.error('Gemini content analysis error:', error)
      return {
        keyThemes: [],
        targetAudience: 'General',
        mood: 'Unknown',
        similarContent: [],
        tags: [],
      }
    }
  }

  /**
   * Rewrite a title overview toward a user profile; falls back to the stored overview.
   * @param {{ title: string, overview?: string, genres?: string[] }} content
   * @param {object} userProfile
   * @returns {Promise<string>}
   */
  async generatePersonalizedDescription(content, userProfile) {
    try {
      const prompt = `Generate a personalized description for this animated content based on the user's profile:

Content:
- Title: ${content.title}
- Overview: ${content.overview}
- Genres: ${content.genres?.join(', ') || 'Unknown'}

User Profile:
${JSON.stringify(userProfile, null, 2)}

Create a personalized description that highlights aspects the user would be interested in. Keep it concise (2-3 sentences).

Respond with just the description text.`

      const response = await this.makeApiCall(prompt)
      return response.response.text()
    } catch (error) {
      console.error('Gemini description generation error:', error)
      return content.overview || 'No description available.'
    }
  }
}

export default new GeminiService()
