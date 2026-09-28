/**
 * Send one test email through the configured provider (Resend, SMTP, or console).
 * Layer: CLI script. Use it to confirm email setup before relying on verification mail.
 *
 * Usage: npm run email:test -- you@example.com
 */

import dotenv from 'dotenv'
import { emailProvider, sendEmail } from '../services/emailService.js'

dotenv.config()

const to = process.argv[2]
if (!to || !to.includes('@')) {
  console.error('Usage: npm run email:test -- you@example.com')
  process.exit(1)
}

try {
  console.log(`Sending a test email to ${to} via ${emailProvider()}...`)
  const { delivered } = await sendEmail({
    to,
    subject: 'AniLounge test email',
    text: 'If you can read this, AniLounge email delivery is working.',
    html: '<p>If you can read this, <strong>AniLounge email delivery is working</strong>.</p>',
  })
  console.log(
    delivered
      ? 'Sent. Check the inbox (and spam) for "AniLounge test email".'
      : 'No provider configured, so the email was only printed above.',
  )
  process.exit(0)
} catch (error) {
  console.error('Send failed:', error.message)
  process.exit(1)
}
