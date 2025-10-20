// EmailJS service for sending beta feedback
import emailjs from '@emailjs/browser'

// EmailJS configuration
const EMAILJS_SERVICE_ID = 'your_service_id' // You'll need to set this up
const EMAILJS_TEMPLATE_ID = 'your_template_id' // You'll need to set this up
const EMAILJS_PUBLIC_KEY = 'your_public_key' // You'll need to set this up

export const sendFeedback = async (feedbackData) => {
  try {
    // For now, just log the feedback (you can set up EmailJS later)
    console.log('📧 Beta Feedback Received:', {
      type: feedbackData.type,
      message: feedbackData.message,
      email: feedbackData.email,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    })

    // TODO: Set up EmailJS to send actual emails
    // const result = await emailjs.send(
    //   EMAILJS_SERVICE_ID,
    //   EMAILJS_TEMPLATE_ID,
    //   {
    //     from_name: feedbackData.email || 'Anonymous',
    //     from_email: feedbackData.email || 'no-email@example.com',
    //     feedback_type: feedbackData.type,
    //     message: feedbackData.message,
    //     timestamp: new Date().toISOString(),
    //     user_agent: navigator.userAgent,
    //     page_url: window.location.href
    //   },
    //   EMAILJS_PUBLIC_KEY
    // )

    return { success: true, message: 'Feedback sent successfully!' }
  } catch (error) {
    console.error('Failed to send feedback:', error)
    return { success: false, message: 'Failed to send feedback. Please try again.' }
  }
}

// Alternative: Simple fetch to your backend (if you prefer)
export const sendFeedbackToBackend = async (feedbackData) => {
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...feedbackData,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      })
    })

    if (response.ok) {
      return { success: true, message: 'Feedback sent successfully!' }
    } else {
      throw new Error('Failed to send feedback')
    }
  } catch (error) {
    console.error('Failed to send feedback:', error)
    return { success: false, message: 'Failed to send feedback. Please try again.' }
  }
}
