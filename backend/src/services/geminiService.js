/**
 * Gemini client for search-query expansion and (currently stubbed) chat.
 * Domain service: wraps google generative AI with a 10s timeout and local genre fallbacks.
 * Chat replies are hardcoded until the assistant ships; other methods still call the API when keyed.
 *
 * API reference: https://ai.google.dev/gemini-api/docs
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'

dotenv.config()

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

    return Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini API timeout')), 10000)),
    ])
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

  /**
   * Conversational assistant. Currently returns a static "coming soon" payload (API path is unreachable).
   * @param {string} userMessage
   * @returns {Promise<{ response: string, searchSuggestion: string | null }>}
   */
  async chatWithUser(userMessage) {
    try {
      console.log('ChatWithUser called with message:', userMessage)

      return {
        response:
          "🚧 AI Assistant is coming soon! For now, you can use the search filters to find animated content. Try searching for genres like 'action', 'comedy', or 'fantasy'.",
        searchSuggestion: null,
      }

      if (!this.hasApiKey) {
        console.log('No API key available')
        return {
          response: "I'm sorry, but I'm not available right now. Please try again later.",
          searchSuggestion: null,
        }
      }

      const prompt = `You are an AI assistant for an animated content discovery app. Help users find anime, movies, and series.

User message: "${userMessage}"

Respond as a helpful assistant. If the user is asking for recommendations or searching for content, suggest a search term they can use.

Examples:
- "I want action anime" → suggest searching "action anime"
- "Best Studio Ghibli movies" → suggest searching "studio ghibli"
- "Something like Naruto" → suggest searching "shounen anime"

Keep responses conversational and helpful. If you suggest a search, mention it clearly.

Respond in 1-2 sentences max.`

      const response = await this.makeApiCall(prompt)
      const aiResponse = response.response.text()

      let searchSuggestion = null
      if (aiResponse.toLowerCase().includes('search') || aiResponse.toLowerCase().includes('try')) {
        const searchMatch =
          aiResponse.match(/"(.*?)"/) || aiResponse.match(/search for (.*?)(?:\.|$)/i)
        if (searchMatch) {
          searchSuggestion = searchMatch[1].toLowerCase()
        }
      }

      return {
        response: aiResponse,
        searchSuggestion,
      }
    } catch (error) {
      console.error('Gemini chat error:', error)
      return {
        response:
          "I'm having trouble processing your request right now. Please try asking me about anime recommendations or searching for specific content.",
        searchSuggestion: null,
      }
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
