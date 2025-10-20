// import nodemailer from 'nodemailer' // Optional: install nodemailer if you want email notifications

// Simple feedback storage (you can enhance this later)
const feedbackStore = []

export const submitFeedback = async (req, res) => {
  try {
    const { type, message, email, timestamp, userAgent, url } = req.body

    // Validate required fields
    if (!type || !message) {
      return res.status(400).json({
        success: false,
        message: 'Feedback type and message are required',
      })
    }

    // Create feedback object
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

    // Store feedback (in production, you'd save to database)
    feedbackStore.push(feedback)

    // Send email notification (optional)
    await sendFeedbackEmail(feedback)

    console.log('📧 Beta Feedback Received:', feedback)

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

export const getFeedback = async (req, res) => {
  try {
    // In production, you'd fetch from database
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

// Simple email notification function
const sendFeedbackEmail = async (feedback) => {
  try {
    // You can set up nodemailer here if you want email notifications
    // For now, just log it
    console.log('📧 Email notification for feedback:', {
      subject: `Beta Feedback: ${feedback.type}`,
      from: feedback.email,
      message: feedback.message,
      timestamp: feedback.timestamp,
    })
  } catch (error) {
    console.error('Email notification error:', error)
  }
}
