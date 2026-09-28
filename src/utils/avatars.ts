/**
 * avatars.ts — profile picture URL helper.
 *
 * `users.profilePicture` is either a same-origin API path (`/api/avatars/:id?v=...`,
 * or a legacy `/uploads/...` file) or an absolute URL.
 */

import { API_HOST } from '@/services/api'

/**
 * Browser URL for a stored profile picture.
 * @param profilePicture - Stored value, if any.
 * @returns Absolute or same-origin URL, or '' when there is no picture.
 */
export const getAvatarUrl = (profilePicture?: string | null) => {
  if (!profilePicture) return ''
  if (/^https?:\/\//.test(profilePicture)) return profilePicture
  return `${API_HOST}${profilePicture}`
}
