/**
 * In-memory beta-feedback HTTP handlers.
 *
 * Layer: controller. Stores submissions in process memory (not Postgres) and emails
 * each one to the support inbox (SUPPORT_EMAIL, default support@anilounge.net).
 */

import { sendFeedbackEmail } from '../services/emailService.js'

const feedbackStore = []

/**
 * Validate and append a feedback record, then email it to support.
 *
 * @param {import('express').Request} req - `body.type` and `body.message` required; email/timestamp/userAgent/url optional.
 * @param {import('express').Response} res - 200 `{ data: { id } }`, 400 if type/message missing, or 500.
 * @returns {Promise<void>}
 */
export const submitFeedback = async (req, res) => {
  try {
    const { type, message, email, timestamp, userAgent, url } = req.body

    if (!type || !message) {
      return res.status(400).json({
        success: false,
        message: 'Feedback type and message are required',
      })
    }

    const feedback = {
      id: Date.now().toString(),
      type,
      message,
      email: email || 'anonymous',
      timestamp: timestamp || new Date().toISOString(),
      userAgent: userAgent || 'unknown',
      url: url || 'unknown',
      status: 'new',
    }

    // In-process only; not persisted across restarts.
    feedbackStore.push(feedback)

    // A mail outage should not lose the submission or fail the form.
    await sendFeedbackEmail(feedback).catch((error) => {
      console.error('Feedback email failed:', error)
    })

    console.log('Beta Feedback Received:', feedback)

    res.json({
      success: true,
      message: 'Feedback submitted successfully! Thank you for helping us improve.',
      data: { id: feedback.id },
    })
  } catch (error) {
    console.error('Feedback submission error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback. Please try again.',
    })
  }
}

/**
 * Return every in-memory feedback record. The route restricts this to admins.
 *
 * @param {import('express').Request} req - Unused; listing is unfiltered.
 * @param {import('express').Response} res - 200 `{ data: feedbackStore }` or 500.
 * @returns {Promise<void>}
 */
export const getFeedback = async (req, res) => {
  try {
    res.json({
      success: true,
      data: feedbackStore,
    })
  } catch (error) {
    console.error('Get feedback error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve feedback',
    })
  }
}
