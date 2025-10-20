#!/usr/bin/env node

// Simple script to view beta feedback
import fetch from 'node-fetch'

const API_BASE_URL = process.env.API_URL || 'http://localhost:5001/api'

async function viewFeedback() {
  try {
    console.log('📧 Fetching beta feedback...\n')

    const response = await fetch(`${API_BASE_URL}/feedback`)
    const result = await response.json()

    if (result.success) {
      const feedback = result.data

      if (feedback.length === 0) {
        console.log('No feedback received yet.')
        return
      }

      console.log(`📊 Total feedback entries: ${feedback.length}\n`)

      feedback.forEach((item, index) => {
        console.log(`--- Feedback #${index + 1} ---`)
        console.log(`📝 Type: ${item.type}`)
        console.log(`📧 Email: ${item.email}`)
        console.log(`💬 Message: ${item.message}`)
        console.log(`🕒 Timestamp: ${item.timestamp}`)
        console.log(`🌐 URL: ${item.url}`)
        console.log(`📱 User Agent: ${item.userAgent}`)
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
