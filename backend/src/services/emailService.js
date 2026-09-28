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
 * SMTP_USER, SMTP_PASS; EMAIL_FROM, EMAIL_REPLY_TO (optional), PUBLIC_APP_URL (link
 * base; falls back to the first FRONTEND_URL entry, then https://anilounge.net).
 */

import nodemailer from 'nodemailer'

export const DEFAULT_EMAIL_FROM = 'AniLounge <notify@anilounge.net>'

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
 * @param {{ from: string, to: string, subject: string, text: string, html?: string, replyTo?: string }} message
 * @returns {Promise<void>}
 * @throws When Resend rejects the message (bad key, unverified domain, ...).
 */
async function sendViaResend({ from, to, subject, text, html, replyTo }) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(`Resend rejected the email (${response.status}): ${body.message || 'unknown error'}`)
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
    process.env.PUBLIC_APP_URL || String(process.env.FRONTEND_URL || '').split(',')[0].trim()
  return (configured || 'https://anilounge.net').replace(/\/+$/, '')
}

/**
 * Send one email. Used for security mail now and announcements later.
 *
 * @param {{ to: string, subject: string, text: string, html?: string }} message
 * @returns {Promise<{ delivered: boolean }>} `delivered` is false when logged to the console instead.
 * @throws When SMTP is configured and the send fails.
 */
export async function sendEmail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM
  const replyTo = process.env.EMAIL_REPLY_TO || undefined
  const provider = emailProvider()

  if (provider === 'resend') {
    await sendViaResend({ from, to, subject, text, html, replyTo })
    return { delivered: true }
  }
  if (provider === 'smtp') {
    await getTransporter().sendMail({ from, to, subject, text, html, replyTo })
    return { delivered: true }
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('No email provider configured; email was NOT sent. Set RESEND_API_KEY or SMTP_HOST.')
  }
  console.log(`\n📧 [email not sent: no provider configured]\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`)
  return { delivered: false }
}

/**
 * Minimal branded HTML wrapper; content is trusted template markup, not user input.
 * @param {string} heading
 * @param {string} bodyHtml
 * @returns {string}
 */
function layout(heading, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#152238">
<div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;padding:32px">
<h1 style="font-size:22px;margin:0 0 16px">${heading}</h1>${bodyHtml}
<p style="font-size:12px;color:#8b93a6;margin-top:32px">AniLounge · You received this because of activity on your account.</p>
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
    text: `Hi ${user.username},\n\nYour verification code is ${code}. It expires in 24 hours.${note}\n\nOr open this link to verify: ${link}\n\nIf you didn't sign up, ignore this email.`,
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
    text: `Hi ${user.username},\n\nYour account was locked after several failed sign-in attempts. If this was you, unlock it now with code ${code} or this link: ${link}\n\nThe link expires in 1 hour. Otherwise the lock lifts on its own in 30 minutes. If this wasn't you, consider changing your password after signing in.`,
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
    text: `Hi ${previous.username},\n\nThe email on your AniLounge account was changed to ${newEmail}. If you did this, no action is needed. If not, contact support@anilounge.net right away so we can secure your account.`,
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
    text: `Hi ${user.username},\n\nYou haven't used AniLounge in almost a year. To protect your data, inactive accounts are deleted after one year. Your account, watchlist, ratings, and favorites will be permanently deleted on ${date} (in ${when}).\n\nTo keep your account, just sign in before then: ${link}\n\nIf you'd rather let it go, you don't need to do anything.`,
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
    text: `Hi ${user.username},\n\nYour AniLounge account was deleted after a year without activity, as we warned in earlier emails. Your watchlist, ratings, favorites, and profile have been removed.\n\nYou're welcome back anytime: ${appUrl()}/register`,
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
    text: `Hi ${user.username},\n\nYou signed up for AniLounge but haven't verified your email yet. Your account will be deleted on ${when} UTC (in about 1 day) unless you verify it.\n\nYour new verification code is ${code}. Or open this link to verify: ${link}\n\nIf you didn't sign up, ignore this email and the account will be removed.`,
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
