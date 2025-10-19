// import { GoogleGenAI } from '@google/genai' // Temporarily disabled

// https://ai.google.dev/gemini-api/docs

class GeminiService {
  constructor() {
    this.client = null
    this.hasApiKey = false // Temporarily disable all Gemini API calls
    // if (this.hasApiKey) {
    //   this.client = new GoogleGenAI({})
    // }
  }

  // Helper method to make API calls with timeout
  async makeApiCall(prompt) {
    return Promise.race([
      this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini API timeout')), 3000)),
    ])
  }

  // Enhanced search with AI semantic understanding (optimized)
  async enhanceSearchQuery(userQuery) {
    try {
      // Only use AI if we have a client and the query is complex enough
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
      const suggestions = response.text
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

  // Generate simple suggestions without AI
  generateSimpleSuggestions(query) {
    const queryLower = query.toLowerCase()
    const suggestions = []

    // Genre-based suggestions
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

  // Extract genres from query
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

  // Chat with user (conversational AI)
  async chatWithUser(userMessage) {
    try {
      if (!this.hasApiKey) {
        return {
          response: "I'm sorry, but I'm not available right now. Please try again later.",
          searchSuggestion: null,
        }
      }

      const prompt = `You are an AI assistant for an animated content discovery app. Help users find anime, movies, and TV shows.

User message: "${userMessage}"

Respond as a helpful assistant. If the user is asking for recommendations or searching for content, suggest a search term they can use.

Examples:
- "I want action anime" → suggest searching "action anime"
- "Best Studio Ghibli movies" → suggest searching "studio ghibli"
- "Something like Naruto" → suggest searching "shounen anime"

Keep responses conversational and helpful. If you suggest a search, mention it clearly.

Respond in 1-2 sentences max.`

      const response = await this.makeApiCall(prompt)
      const aiResponse = response.text

      // Extract search suggestion if present
      let searchSuggestion = null
      if (aiResponse.toLowerCase().includes('search') || aiResponse.toLowerCase().includes('try')) {
        // Simple extraction - look for quoted terms or common patterns
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

  // Generate content recommendations based on user preferences
  async generateRecommendations(userPreferences, availableContent) {
    try {
      const prompt = `You are an AI assistant that recommends animated movies and TV shows.

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
      const content = response.text
      return JSON.parse(content)
    } catch (error) {
      console.error('Gemini recommendation error:', error)
      return { recommendations: [] }
    }
  }

  // Analyze content and extract key features
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
      const responseContent = response.text
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

  // Generate personalized content descriptions
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
      return response.text
    } catch (error) {
      console.error('Gemini description generation error:', error)
      return content.overview || 'No description available.'
    }
  }
}

export default new GeminiService()
