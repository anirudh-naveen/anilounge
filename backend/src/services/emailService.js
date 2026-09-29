/**
 * Outbound email for account security and site notifications.
 *
 * Layer: service. Sends as `notify@anilounge.net` by default through the first
 * configured provider:
 *   1. Resend's HTTPS API (`RESEND_API_KEY`), which works on hosts that block SMTP
 *      ports (Railway below the Pro plan),
 *   2. SMTP via nodemailer (`SMTP_HOST`, ...),
 *   3. otherwise messages are printed to the server console (local development)
 *      so codes and links can still be used.
 *
 * Env: RESEND_API_KEY | SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ('true' for 465),
 * SMTP_USER, SMTP_PASS; EMAIL_FROM, EMAIL_REPLY_TO (optional), SUPPORT_EMAIL (feedback
 * recipient, default support@anilounge.net), PUBLIC_APP_URL (link base; falls back to
 * the first FRONTEND_URL entry, then https://anilounge.net).
 */

import nodemailer from 'nodemailer'

export const DEFAULT_EMAIL_FROM = 'AniLounge <notify@anilounge.net>'
export const DEFAULT_SUPPORT_EMAIL = 'support@anilounge.net'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

let transporter = null

/**
 * Which delivery path `sendEmail` will use.
 * @returns {'resend' | 'smtp' | 'console'}
 */
export function emailProvider() {
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.SMTP_HOST) return 'smtp'
  return 'console'
}

/**
 * POST one message to Resend.
 * @param {{ from: string, to: string, subject: string, text: string, html?: string, replyTo?: string, headers?: Record<string, string> }} message
 * @returns {Promise<void>}
 * @throws When Resend rejects the message (bad key, unverified domain, ...).
 */
async function sendViaResend({ from, to, subject, text, html, replyTo, headers }) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(headers ? { headers } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(
      `Resend rejected the email (${response.status}): ${body.message || 'unknown error'}`,
    )
  }
}

/**
 * Lazily built SMTP transport, or null when SMTP is not configured.
 * @returns {import('nodemailer').Transporter | null}
 */
function getTransporter() {
  if (!process.env.SMTP_HOST) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  }
  return transporter
}

/**
 * Base URL of the web app used in emailed links.
 * @returns {string}
 */
export function appUrl() {
  const configured =
    process.env.PUBLIC_APP_URL ||
    String(process.env.FRONTEND_URL || '')
      .split(',')[0]
      .trim()
  return (configured || 'https://anilounge.net').replace(/\/+$/, '')
}

/**
 * Address that receives bug reports and other site feedback.
 * @returns {string}
 */
export function supportEmail() {
  return process.env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL
}

/**
 * Send one email (security mail, feedback, and announcements).
 *
 * @param {{ to: string, subject: string, text: string, html?: string, replyTo?: string, headers?: Record<string, string> }} message
 *   `replyTo` overrides EMAIL_REPLY_TO; `headers` adds raw headers such as List-Unsubscribe.
 * @returns {Promise<{ delivered: boolean }>} `delivered` is false when logged to the console instead.
 * @throws When SMTP is configured and the send fails.
 */
export async function sendEmail({ to, subject, text, html, replyTo, headers }) {
  const from = process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM
  replyTo = replyTo || process.env.EMAIL_REPLY_TO || undefined
  const provider = emailProvider()

  if (provider === 'resend') {
    await sendViaResend({ from, to, subject, text, html, replyTo, headers })
    return { delivered: true }
  }
  if (provider === 'smtp') {
    await getTransporter().sendMail({ from, to, subject, text, html, replyTo, headers })
    return { delivered: true }
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(
      'No email provider configured; email was NOT sent. Set RESEND_API_KEY or SMTP_HOST.',
    )
  }
  console.log(
    `\n📧 [email not sent: no provider configured]\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`,
  )
  return { delivered: false }
}

export const DEFAULT_LOGO_URL = 'https://www.anilounge.net/anilounge-logo.png'

/**
 * Whether emailed links can be opened by recipients (not localhost or plain http).
 * @returns {boolean}
 */
export function hasPublicAppUrl() {
  const { protocol, hostname } = new URL(appUrl())
  return protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

/**
 * Absolute URL of the logo shown in email footers. Mail clients fetch images through
 * their own proxies and need a hosted PNG (no SVG or data URIs), so this always points
 * at the live site's copy of public/anilounge-logo.png, even when sending from a dev
 * machine. Override with EMAIL_LOGO_URL.
 * @returns {string}
 */
export function logoUrl() {
  return process.env.EMAIL_LOGO_URL || DEFAULT_LOGO_URL
}

/**
 * Where users manage optional emails (Settings → Email).
 * @returns {string}
 */
export function emailSettingsLink() {
  return `${appUrl()}/settings#email`
}

/**
 * Footer for account and security emails, which cannot be turned off.
 * @returns {string}
 */
function accountFooterHtml() {
  return `AniLounge · This is an account email about activity on your account, so it can't be turned off. <a href="${emailSettingsLink()}" style="color:#8b93a6">Manage other emails</a>.`
}

/**
 * Plain-text version of the account footer, appended to account email bodies.
 * @param {string} text
 * @returns {string}
 */
function withAccountFooter(text) {
  return `${text}\n\n—\nThis is an account email, so it can't be turned off. Manage other emails: ${emailSettingsLink()}`
}

/**
 * Minimal branded HTML wrapper; content is trusted template markup, not user input.
 * @param {string} heading
 * @param {string} bodyHtml
 * @returns {string}
 */
function layout(heading, bodyHtml, footerHtml = accountFooterHtml()) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#152238">
<div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;padding:32px">
<h1 style="font-size:22px;margin:0 0 16px">${heading}</h1>${bodyHtml}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #e6e8ee;padding-top:16px;width:100%">
<tr><td style="width:40px;vertical-align:middle;padding-right:12px"><a href="${appUrl()}"><img src="${logoUrl()}" width="40" height="40" alt="AniLounge" style="display:block;border:0;border-radius:8px"></a></td>
<td style="vertical-align:middle;font-size:12px;color:#8b93a6">${footerHtml}</td></tr>
</table>
</div></body></html>`
}

/**
 * Escape text for interpolation into email HTML.
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** Shown to new sign-ups; must match UNVERIFIED_SIGNUP_TTL in unverifiedAccountService. */
const SIGNUP_REMOVAL_NOTE = 'New accounts that are not verified within 3 days are removed.'

/**
 * Verification email with a code and a one-click link (sign-up or email change).
 * @param {{ email: string, username: string, pendingSignup?: boolean }} user - `pendingSignup` adds the 3-day removal note.
 * @param {string} code - Six-digit code.
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendVerificationEmail(user, code) {
  const link = `${appUrl()}/verify-email?email=${encodeURIComponent(user.email)}&code=${code}`
  const note = user.pendingSignup ? ` ${SIGNUP_REMOVAL_NOTE}` : ''
  return sendEmail({
    to: user.email,
    subject: 'Verify your AniLounge email',
    text: withAccountFooter(`Hi ${user.username},\n\nYour verification code is ${code}. It expires in 24 hours.${note}\n\nOr open this link to verify: ${link}\n\nIf you didn't sign up, ignore this email.`),
    html: layout(
      'Verify your email',
      `<p>Hi ${escapeHtml(user.username)}, welcome to AniLounge!</p>
<p>Your verification code:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:8px 0 24px">${code}</p>
<p><a href="${link}" style="background:#e07a5f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Verify email</a></p>
<p style="color:#5b6578;font-size:14px">The code expires in 24 hours.${note} If you didn't sign up, ignore this email.</p>`,
    ),
  })
}

/**
 * Lockout notice with a link that unlocks the account.
 * @param {{ email: string, username: string }} user
 * @param {string} code - Six-digit unlock code.
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendUnlockEmail(user, code) {
  const link = `${appUrl()}/unlock-account?email=${encodeURIComponent(user.email)}&code=${code}`
  return sendEmail({
    to: user.email,
    subject: 'Your AniLounge account was locked',
    text: withAccountFooter(`Hi ${user.username},\n\nYour account was locked after several failed sign-in attempts. If this was you, unlock it now with code ${code} or this link: ${link}\n\nThe link expires in 1 hour. Otherwise the lock lifts on its own in 30 minutes. If this wasn't you, consider changing your password after signing in.`),
    html: layout(
      'Account locked',
      `<p>Hi ${escapeHtml(user.username)}, your account was locked after several failed sign-in attempts.</p>
<p>If this was you, unlock it now:</p>
<p><a href="${link}" style="background:#e07a5f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Unlock my account</a></p>
<p style="color:#5b6578;font-size:14px">Or enter code <strong>${code}</strong>. The link expires in 1 hour; otherwise the lock lifts on its own in 30 minutes. If this wasn't you, consider changing your password after signing in.</p>`,
    ),
  })
}

/**
 * Security notice to the previous address after an email change.
 * @param {{ email: string, username: string }} previous - Old address and username.
 * @param {string} newEmail
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendEmailChangedNotice(previous, newEmail) {
  return sendEmail({
    to: previous.email,
    subject: 'Your AniLounge email was changed',
    text: withAccountFooter(`Hi ${previous.username},\n\nThe email on your AniLounge account was changed to ${newEmail}. If you did this, no action is needed. If not, contact support@anilounge.net right away so we can secure your account.`),
    html: layout(
      'Email changed',
      `<p>Hi ${escapeHtml(previous.username)}, the email on your AniLounge account was changed to <strong>${escapeHtml(newEmail)}</strong>.</p>
<p style="color:#5b6578;font-size:14px">If you did this, no action is needed. If not, contact support@anilounge.net right away so we can secure your account.</p>`,
    ),
  })
}

/**
 * Human phrase for a countdown in days ("3 months", "2 weeks", "1 day").
 * @param {number} days
 * @returns {string}
 */
function describeDays(days) {
  if (days >= 60) return `${Math.round(days / 30)} months`
  if (days >= 28) return '1 month'
  if (days >= 14 && days % 7 === 0) return `${days / 7} weeks`
  if (days === 7) return '1 week'
  return days === 1 ? '1 day' : `${days} days`
}

/**
 * Warning that an inactive account will be deleted; signing in keeps it.
 * @param {{ email: string, username: string }} user
 * @param {number} daysLeft - Whole days until deletion.
 * @param {Date} deleteAt
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendInactivityWarning(user, daysLeft, deleteAt) {
  const when = describeDays(daysLeft)
  const date = deleteAt.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })
  const link = `${appUrl()}/login`
  return sendEmail({
    to: user.email,
    subject: `Your AniLounge account will be deleted in ${when}`,
    text: withAccountFooter(`Hi ${user.username},\n\nYou haven't used AniLounge in almost a year. To protect your data, inactive accounts are deleted after one year. Your account, watchlist, ratings, and favorites will be permanently deleted on ${date} (in ${when}).\n\nTo keep your account, just sign in before then: ${link}\n\nIf you'd rather let it go, you don't need to do anything.`),
    html: layout(
      `Your account will be deleted in ${when}`,
      `<p>Hi ${escapeHtml(user.username)}, you haven't used AniLounge in almost a year.</p>
<p>Inactive accounts are deleted after one year. Your account, watchlist, ratings, and favorites will be permanently deleted on <strong>${date}</strong>.</p>
<p><a href="${link}" style="background:#e07a5f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Sign in to keep my account</a></p>
<p style="color:#5b6578;font-size:14px">If you'd rather let it go, you don't need to do anything.</p>`,
    ),
  })
}

/**
 * Confirmation sent after an inactive account was deleted.
 * @param {{ email: string, username: string }} user
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendInactiveAccountDeleted(user) {
  return sendEmail({
    to: user.email,
    subject: 'Your AniLounge account has been deleted',
    text: withAccountFooter(`Hi ${user.username},\n\nYour AniLounge account was deleted after a year without activity, as we warned in earlier emails. Your watchlist, ratings, favorites, and profile have been removed.\n\nYou're welcome back anytime: ${appUrl()}/register`),
    html: layout(
      'Your account has been deleted',
      `<p>Hi ${escapeHtml(user.username)}, your AniLounge account was deleted after a year without activity, as we warned in earlier emails.</p>
<p>Your watchlist, ratings, favorites, and profile have been removed.</p>
<p style="color:#5b6578;font-size:14px">You're welcome back anytime at <a href="${appUrl()}/register">${appUrl()}</a>.</p>`,
    ),
  })
}

/**
 * Reminder one day before an unverified sign-up is deleted, with a fresh code.
 * @param {{ email: string, username: string }} user
 * @param {string} code - New six-digit code.
 * @param {Date} deleteAt
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendVerificationReminder(user, code, deleteAt) {
  const link = `${appUrl()}/verify-email?email=${encodeURIComponent(user.email)}&code=${code}`
  const when = deleteAt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })
  return sendEmail({
    to: user.email,
    subject: 'Verify your AniLounge email to keep your account',
    text: withAccountFooter(`Hi ${user.username},\n\nYou signed up for AniLounge but haven't verified your email yet. Your account will be deleted on ${when} UTC (in about 1 day) unless you verify it.\n\nYour new verification code is ${code}. Or open this link to verify: ${link}\n\nIf you didn't sign up, ignore this email and the account will be removed.`),
    html: layout(
      'Verify your email to keep your account',
      `<p>Hi ${escapeHtml(user.username)}, you signed up for AniLounge but haven't verified your email yet.</p>
<p>Your account will be deleted on <strong>${when} UTC</strong> (in about 1 day) unless you verify it.</p>
<p>Your new verification code:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:8px 0 24px">${code}</p>
<p><a href="${link}" style="background:#e07a5f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Verify email</a></p>
<p style="color:#5b6578;font-size:14px">If you didn't sign up, ignore this email and the account will be removed.</p>`,
    ),
  })
}

/**
 * New friend request notice. The requester's username and note are user input, so
 * they are escaped; the note is quoted as written.
 * @param {{ email: string, username: string }} recipient
 * @param {{ username: string }} requester
 * @param {string} note - Optional note sent with the request ('' for none).
 * @param {Date} expiresAt - When the request is removed if unanswered.
 * @param {string} unsubscribeUrl - One-click opt-out from friend request emails.
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendFriendRequestEmail(recipient, requester, note, expiresAt, unsubscribeUrl) {
  const link = `${appUrl()}/friends`
  const expires = expiresAt.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' })
  const noteText = note ? `\n\nTheir note: "${note}"` : ''
  const noteHtml = note
    ? `<p style="margin:16px 0;padding:12px 16px;background:#f4f5f7;border-radius:8px;white-space:pre-wrap">${escapeHtml(note)}</p>`
    : ''
  return sendEmail({
    to: recipient.email,
    subject: `${requester.username} sent you a friend request on AniLounge`,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: `Hi ${recipient.username},\n\n${requester.username} wants to be friends on AniLounge.${noteText}\n\nAccept or decline it here: ${link}\n\nThe request expires on ${expires} if you don't answer.\n\n—\nStop getting friend request emails: ${unsubscribeUrl}`,
    html: layout(
      'New friend request',
      `<p>Hi ${escapeHtml(recipient.username)}, <strong>${escapeHtml(requester.username)}</strong> wants to be friends on AniLounge.</p>${noteHtml}
<p><a href="${link}" style="background:#e07a5f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">View request</a></p>
<p style="color:#5b6578;font-size:14px">The request expires on ${expires} if you don't answer.</p>`,
      `AniLounge · You're receiving this because someone sent you a friend request. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8b93a6">Stop friend request emails</a> or <a href="${emailSettingsLink()}" style="color:#8b93a6">manage all emails</a>.`,
    ),
  })
}

/**
 * Forward a beta feedback submission to the support inbox. Everything in `feedback`
 * comes from the public form, so it is escaped and the subject is flattened.
 * @param {{ id: string, type: string, message: string, email: string, timestamp: string, userAgent: string, url: string }} feedback
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendFeedbackEmail(feedback) {
  const type = String(feedback.type).replace(/\s+/g, ' ').trim().slice(0, 60)
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedback.email) ? feedback.email : undefined
  const details = [
    ['Type', type],
    ['From', feedback.email],
    ['Page', feedback.url],
    ['Submitted', feedback.timestamp],
    ['Browser', feedback.userAgent],
    ['ID', feedback.id],
  ]
  return sendEmail({
    to: supportEmail(),
    replyTo,
    subject: `[AniLounge feedback] ${type}`,
    text: `${feedback.message}\n\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}`,
    html: layout(
      `Feedback: ${escapeHtml(type)}`,
      `<p style="white-space:pre-wrap">${escapeHtml(feedback.message)}</p>
<table style="font-size:13px;color:#5b6578;margin-top:24px">${details
        .map(
          ([label, value]) =>
            `<tr><td style="padding-right:12px;vertical-align:top">${label}</td><td>${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`,
      'AniLounge · Sent from the beta feedback form.',
    ),
  })
}

/**
 * One announcement to one user, with a one-click unsubscribe link and header.
 * `bodyText` is written by the site owner; paragraphs are split on blank lines.
 * @param {{ email: string, username: string }} user
 * @param {{ subject: string, bodyText: string }} announcement
 * @param {string} unsubscribeUrl
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendAnnouncementEmail(user, { subject, bodyText }, unsubscribeUrl) {
  const paragraphs = bodyText
    .trim()
    .split(/\n\s*\n/)
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
  return sendEmail({
    to: user.email,
    subject,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: `Hi ${user.username},\n\n${bodyText.trim()}\n\n—\nYou're receiving this because you have an AniLounge account. Unsubscribe from announcements: ${unsubscribeUrl}`,
    html: layout(
      escapeHtml(subject),
      `<p>Hi ${escapeHtml(user.username)},</p>\n${paragraphs}`,
      `AniLounge · You're receiving this because you have an AniLounge account. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8b93a6">Unsubscribe from announcements</a> or <a href="${emailSettingsLink()}" style="color:#8b93a6">manage all emails</a>.`,
    ),
  })
}
