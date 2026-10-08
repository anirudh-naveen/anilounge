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
              description: 'Title keywords, themes, or character names used only to find titles',
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
          'Fetch a short Wikipedia or catalog summary for an animated movie/series already in the catalog, an animation studio, a voice actor, a character, or a genre. Never use this to discover titles to recommend. Character lookups must not produce series recommendations.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: 'Title, studio, voice actor, character, or genre name',
            },
            title: {
              type: SchemaType.STRING,
              description: 'Alias of name for catalog titles',
            },
            kind: {
              type: SchemaType.STRING,
              enum: ['title', 'studio', 'voice_actor', 'genre', 'character'],
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
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Gemini API timeout')), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }

  /**
   * Merge tool args with the signed-in user's favorite genres/studios and watchlist exclusions.
   * @param {object} [args]
   * @param {object|null} [userContext]
   * @returns {object}
   */
  catalogSearchFilters(args = {}, userContext = null) {
    return {
      ...args,
      excludeIds: userContext?.excludeIds || [],
      favoriteGenres: userContext?.favoriteGenres || [],
      favoriteStudios: userContext?.favoriteStudios || [],
    }
  }

  /**
   * Order chat cards by genre, then studio, then rating, and attach a why clause.
   * @param {object[]} docs
   * @param {object} [filters]
   * @param {object|null} [userContext]
   * @returns {object[]}
   */
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
        : 'I can help with animated movies, series, studios, voice actors, characters, and genres in the AniLounge catalog.',
      results: docs.map(serializeCatalogDoc),
      searchSuggestion: null,
    }
  }

  /**
   * Conversational assistant grounded in the catalog via Gemini function calls.
   * @param {string} userMessage
   * @param {{ history?: object[], userContext?: object|null }} [options]
   * @returns {Promise<{ response: string, results: object[], searchSuggestion: string | null }>}
   */
  async chatWithUser(userMessage, { history = [], userContext = null } = {}) {
    const message = String(userMessage || '').trim()
    if (!message) {
      return {
        response: 'Ask about an animated movie, series, studio, voice actor, character, or genre.',
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

}

export default new GeminiService()
