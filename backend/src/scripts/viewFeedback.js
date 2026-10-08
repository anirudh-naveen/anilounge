#!/usr/bin/env node

/**
 * Read-only diagnostic script: print beta feedback from GET /api/feedback.
 * Run against a live API (API_URL, default localhost:5001). Does not mutate the database.
 * The endpoint is admin-only: set ADMIN_ACCESS_TOKEN to an access token for an account
 * listed in the server's ADMIN_EMAILS.
 */
const API_BASE_URL = process.env.API_URL || 'http://localhost:5001/api'

/**
 * Fetch and print each feedback row (type, email, message, timestamp, url, user agent).
 * @returns {Promise<void>}
 */
async function viewFeedback() {
  try {
    console.log('Fetching beta feedback...\n')

    const token = process.env.ADMIN_ACCESS_TOKEN
    if (!token) {
      console.error('Set ADMIN_ACCESS_TOKEN to an admin access token.')
      process.exitCode = 1
      return
    }
    const response = await fetch(`${API_BASE_URL}/feedback`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json()

    if (result.success) {
      const feedback = result.data

      if (feedback.length === 0) {
        console.log('No feedback received yet.')
        return
      }

      console.log(`Total feedback entries: ${feedback.length}\n`)

      feedback.forEach((item, index) => {
        console.log(`--- Feedback #${index + 1} ---`)
        console.log(`Type: ${item.type}`)
        console.log(`Email: ${item.email}`)
        console.log(`Message: ${item.message}`)
        console.log(`Timestamp: ${item.timestamp}`)
        console.log(`URL: ${item.url}`)
        console.log(`User Agent: ${item.userAgent}`)
        console.log('')
      })
    } else {
      console.error('Failed to fetch feedback:', result.message)
    }
  } catch (error) {
    console.error('Error fetching feedback:', error.message)
  }
}

viewFeedback()
