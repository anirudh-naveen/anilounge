/**
 * donations.ts — where visitors can donate to AniLounge.
 *
 * The Ko-fi page; `VITE_DONATE_URL` overrides it (set it to an empty string to hide
 * every donate link). Donations made with an account's email give it the Supporter badge
 * (the backend's Ko-fi webhook, services/donationService.js).
 */

export const DONATE_URL = String(
  import.meta.env.VITE_DONATE_URL ?? 'https://ko-fi.com/anilounge',
).trim()
