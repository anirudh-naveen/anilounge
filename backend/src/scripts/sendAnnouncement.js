/**
 * Email an announcement to every verified account that hasn't opted out, and post it
 * as site news in every inbox (the profile-menu Inbox).
 * Layer: CLI script. Sends as notify@anilounge.net through the configured provider.
 *
 * Usage:
 *   npm run email:announce -- --subject "Forums are live" --file announcement.txt
 *       Dry run: prints the recipient count and a preview; sends nothing.
 *   ... --test you@example.com   Send only to that address.
 *   ... --send                   Send to every recipient and post it to inboxes.
 *   ... --inbox-only             Post it to inboxes without emailing anyone.
 *
 * The file is plain text; blank lines separate paragraphs. Each email starts with
 * "Hi <username>," and ends with an unsubscribe link.
 */

import fs from 'fs'
import { parseArgs } from 'util'
import dotenv from 'dotenv'
import {
  appUrl,
  emailProvider,
  hasPublicAppUrl,
  sendAnnouncementEmail,
} from '../services/emailService.js'
import { listAnnouncementRecipients, sendAnnouncement } from '../services/announcementService.js'
import { postAnnouncement } from '../services/inboxService.js'

dotenv.config()

const usage =
  'Usage: npm run email:announce -- --subject "..." --file announcement.txt [--test you@example.com | --send | --inbox-only]'

let options
try {
  ;({ values: options } = parseArgs({
    options: {
      subject: { type: 'string' },
      file: { type: 'string' },
      test: { type: 'string' },
      send: { type: 'boolean', default: false },
      'inbox-only': { type: 'boolean', default: false },
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
if ([options.test, options.send, options['inbox-only']].filter(Boolean).length > 1) {
  console.error('Use only one of --test, --send, and --inbox-only.')
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

  if (options['inbox-only']) {
    await postAnnouncement({ title: subject, body: bodyText })
    console.log('Posted to every inbox. No emails sent.')
    process.exit(0)
  }

  const recipients = await listAnnouncementRecipients()
  console.log(`Subject: ${subject}\n\n${bodyText}\n`)
  console.log(`${recipients.length} recipient(s); provider: ${provider}; links: ${appUrl()}`)

  if (!options.send) {
    console.log(
      'Dry run: nothing sent. Add --send to email everyone and post to inboxes, --inbox-only to\n' +
        'only post to inboxes, or --test <email> to preview the email.',
    )
    process.exit(0)
  }
  if (provider === 'console') {
    console.error('No email provider configured (RESEND_API_KEY or SMTP_HOST); refusing to send.')
    process.exit(1)
  }
  if (!hasPublicAppUrl()) {
    console.error(
      `Links would point at ${appUrl()}, so unsubscribe links would not work; refusing to send.\n` +
        'Rerun with PUBLIC_APP_URL=https://www.anilounge.net in front of the command.',
    )
    process.exit(1)
  }

  await postAnnouncement({ title: subject, body: bodyText })
  console.log('Posted to every inbox.')
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
