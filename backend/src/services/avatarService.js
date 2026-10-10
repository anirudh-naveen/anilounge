/**
 * Profile picture storage in Postgres or Cloudflare R2.
 *
 * Layer: service. Pictures are small cropped images. By default they are stored
 * in `user_avatars` (Postgres). If R2_* environment variables are present, they
 * are uploaded to R2 instead, and users.profile_picture holds the R2 URL.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { query } from '../../config/postgres.js'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

let s3Client = null
if (process.env.R2_BUCKET) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
  })
}

/**
 * Identify an image by its leading bytes; the uploaded MIME type is not trusted.
 * @param {Buffer} buffer
 * @returns {'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null}
 */
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  const gif = buffer.toString('ascii', 0, 6)
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif'
  return null
}

/**
 * Public URL for a user's stored avatar; the version busts caches after a change.
 * @param {string} userId
 * @param {Date} [updatedAt=new Date()]
 * @returns {string}
 */
export function avatarUrl(userId, updatedAt = new Date()) {
  return `/api/avatars/${userId}?v=${updatedAt.getTime()}`
}

/**
 * Store (or replace) a user's avatar.
 * @param {string} userId
 * @param {Buffer} data
 * @param {string} contentType - From `detectImageType`.
 * @returns {Promise<string>} The URL to save as `users.profile_picture`.
 */
export async function saveAvatar(userId, data, contentType) {
  if (s3Client && process.env.AVATAR_PUBLIC_URL) {
    const key = `avatars/${userId}-${crypto.randomBytes(8).toString('hex')}`
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType
    }))
    
    // Clean up Postgres row if one exists so we don't leave orphaned data
    await query('DELETE FROM user_avatars WHERE user_id = $1', [userId])
    
    // Cloudflare public bucket URL
    return `${process.env.AVATAR_PUBLIC_URL.replace(/\/$/, '')}/${key}`
  } else {
    const { rows } = await query(
      `INSERT INTO user_avatars (user_id, content_type, data, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
         SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now()
       RETURNING updated_at`,
      [userId, contentType, data],
    )
    return avatarUrl(userId, new Date(rows[0].updated_at))
  }
}

/**
 * @param {string} userId
 * @returns {Promise<{ contentType: string, data: Buffer, updatedAt: Date } | null>}
 */
export async function getAvatar(userId) {
  const { rows } = await query(
    'SELECT content_type, data, updated_at FROM user_avatars WHERE user_id = $1',
    [userId],
  )
  if (!rows[0]) return null
  return { contentType: rows[0].content_type, data: rows[0].data, updatedAt: rows[0].updated_at }
}

/**
 * Delete an old avatar. It deletes legacy on-disk files or remote R2 objects.
 * Database-stored avatars are left alone (managed by DELETE cascades / queries). 
 * Never throws.
 * @param {string | null | undefined} profilePicture - Stored `users.profile_picture`.
 * @returns {void}
 */
export function deleteLegacyAvatarFile(profilePicture) {
  if (!profilePicture) return
  
  if (profilePicture.startsWith('/uploads/')) {
    const file = path.join(process.cwd(), 'uploads', 'profiles', path.basename(profilePicture))
    fs.promises.unlink(file).catch(() => {})
  } else if (s3Client && process.env.AVATAR_PUBLIC_URL && profilePicture.startsWith(process.env.AVATAR_PUBLIC_URL)) {
    const prefix = process.env.AVATAR_PUBLIC_URL.replace(/\/$/, '') + '/'
    const key = profilePicture.substring(prefix.length)
    if (key) {
      s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key
      })).catch((err) => console.error('Failed to delete old R2 avatar', err))
    }
  }
}

/**
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function deleteAvatar(userId) {
  await query('DELETE FROM user_avatars WHERE user_id = $1', [userId])
}
