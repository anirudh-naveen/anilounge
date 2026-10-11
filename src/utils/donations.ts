/**
 * donations.ts — where visitors can donate to AniLounge.
 *
 * The Ko-fi page; `VITE_DONATE_URL` overrides it (set it to an empty string to hide
 * every donate link). Donations made with an account's email give it the Supporter badge
 * (the backend's Ko-fi webhook, services/donationService.js).
 *
 * Hidden in the iOS app: the badge is a digital perk, which App Store rules only allow
 * selling through Apple's in-app purchase.
 */

import { isNativeApp } from '@/utils/nativeApp'

export const DONATE_URL = isNativeApp
  ? ''
  : String(import.meta.env.VITE_DONATE_URL ?? 'https://ko-fi.com/anilounge').trim()
