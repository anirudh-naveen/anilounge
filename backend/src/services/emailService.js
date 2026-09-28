/**
 * Outbound email for account security and site notifications.
 *
 * Layer: service. Sends through SMTP (nodemailer) as `notify@anilounge.net` by
 * default. When `SMTP_HOST` is unset (local development), messages are printed
 * to the server console instead so codes and links can still be used.
 *
 * Env: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ('true' for 465), SMTP_USER,
 * SMTP_PASS, EMAIL_FROM, PUBLIC_APP_URL (link base; falls back to the first
 * FRONTEND_URL entry, then https://anilounge.net).
 */

import nodemailer from 'nodemailer'

export const DEFAULT_EMAIL_FROM = 'AniLounge <notify@anilounge.net>'

let transporter = null

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
  const transport = getTransporter()
  if (!transport) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SMTP_HOST is not set; email was NOT sent. Configure SMTP for production.')
    }
    console.log(`\n📧 [email not sent: SMTP disabled]\nFrom: ${from}\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`)
    return { delivered: false }
  }
  await transport.sendMail({ from, to, subject, text, html })
  return { delivered: true }
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

/**
 * Sign-up verification email with a code and a one-click link.
 * @param {{ email: string, username: string }} user
 * @param {string} code - Six-digit code.
 * @returns {Promise<{ delivered: boolean }>}
 */
export function sendVerificationEmail(user, code) {
  const link = `${appUrl()}/verify-email?email=${encodeURIComponent(user.email)}&code=${code}`
  return sendEmail({
    to: user.email,
    subject: 'Verify your AniLounge email',
    text: `Hi ${user.username},\n\nYour verification code is ${code}. It expires in 24 hours.\n\nOr open this link to verify: ${link}\n\nIf you didn't sign up, ignore this email.`,
    html: layout(
      'Verify your email',
      `<p>Hi ${escapeHtml(user.username)}, welcome to AniLounge!</p>
<p>Your verification code:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:8px 0 24px">${code}</p>
<p><a href="${link}" style="background:#e07a5f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Verify email</a></p>
<p style="color:#5b6578;font-size:14px">The code expires in 24 hours. If you didn't sign up, ignore this email.</p>`,
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
