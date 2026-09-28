/**
 * Email an announcement to every verified account that hasn't opted out.
 * Layer: CLI script. Sends as notify@anilounge.net through the configured provider.
 *
 * Usage:
 *   npm run email:announce -- --subject "Forums are live" --file announcement.txt
 *       Dry run: prints the recipient count and a preview; sends nothing.
 *   ... --test you@example.com   Send only to that address.
 *   ... --send                   Send to every recipient.
 *
 * The file is plain text; blank lines separate paragraphs. Each email starts with
 * "Hi <username>," and ends with an unsubscribe link.
 */

import fs from 'fs'
import { parseArgs } from 'util'
import dotenv from 'dotenv'
import { appUrl, emailProvider, sendAnnouncementEmail } from '../services/emailService.js'
import { listAnnouncementRecipients, sendAnnouncement } from '../services/announcementService.js'

dotenv.config()

const usage =
  'Usage: npm run email:announce -- --subject "..." --file announcement.txt [--test you@example.com | --send]'

let options
try {
  ;({ values: options } = parseArgs({
    options: {
      subject: { type: 'string' },
      file: { type: 'string' },
      test: { type: 'string' },
      send: { type: 'boolean', default: false },
    },
  }))
} catch (error) {
  console.error(`${error.message}\n${usage}`)
  process.exit(1)
}

const subject = options.subject?.trim()
if (!subject || !options.file) {
  console.error(usage)
  process.exit(1)
}
if (options.test && options.send) {
  console.error('Use either --test or --send, not both.')
  process.exit(1)
}

let bodyText
try {
  bodyText = fs.readFileSync(options.file, 'utf8').trim()
} catch (error) {
  console.error(`Could not read ${options.file}: ${error.message}`)
  process.exit(1)
}
if (!bodyText) {
  console.error(`${options.file} is empty.`)
  process.exit(1)
}

const announcement = { subject, bodyText }
const provider = emailProvider()

try {
  if (options.test) {
    console.log(`Sending a test announcement to ${options.test} via ${provider}...`)
    await sendAnnouncementEmail(
      { email: options.test, username: 'there' },
      announcement,
      // Real sends get a signed per-user link; this one opens the "not valid" page.
      `${appUrl()}/api/email/unsubscribe`,
    )
    console.log('Done. Check the inbox (and spam).')
    process.exit(0)
  }

  const recipients = await listAnnouncementRecipients()
  console.log(`Subject: ${subject}\n\n${bodyText}\n`)
  console.log(`${recipients.length} recipient(s); provider: ${provider}`)

  if (!options.send) {
    console.log(
      'Dry run: nothing sent. Add --send to email everyone, or --test <email> to preview.',
    )
    process.exit(0)
  }
  if (provider === 'console') {
    console.error('No email provider configured (RESEND_API_KEY or SMTP_HOST); refusing to send.')
    process.exit(1)
  }

  const { sent, failed } = await sendAnnouncement(announcement, recipients, {
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) console.log(`  ${done}/${total}`)
    },
  })
  console.log(`Sent ${sent} of ${recipients.length}.`)
  for (const { email, error } of failed) console.error(`  failed: ${email}: ${error}`)
  process.exit(failed.length ? 1 : 0)
} catch (error) {
  console.error('Announcement failed:', error.message)
  process.exit(1)
}
