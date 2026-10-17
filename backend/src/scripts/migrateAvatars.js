import { config } from 'dotenv'
import { resolve } from 'path'
import crypto from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

config({ path: resolve(process.cwd(), '.env') })

// Import query after dotenv to ensure DATABASE_URL is available
import { query } from '../../config/postgres.js'

async function migrateAvatars() {
  if (!process.env.R2_BUCKET || !process.env.AVATAR_PUBLIC_URL) {
    console.error('Error: R2 environment variables (R2_BUCKET, AVATAR_PUBLIC_URL) are not set.')
    process.exit(1)
  }

  const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
  })

  console.log('Starting avatar migration to R2...')

  try {
    const { rows: avatars } = await query('SELECT user_id, content_type, data FROM user_avatars')
    console.log(`Found ${avatars.length} avatars in Postgres to migrate.`)

    let successCount = 0
    let failCount = 0

    for (const avatar of avatars) {
      try {
        const key = `avatars/${avatar.user_id}-${crypto.randomBytes(8).toString('hex')}`
        
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: avatar.data,
          ContentType: avatar.content_type
        }))

        const newUrl = `${process.env.AVATAR_PUBLIC_URL.replace(/\/$/, '')}/${key}`
        
        await query('UPDATE users SET profile_picture = $2 WHERE id = $1', [
          avatar.user_id,
          newUrl
        ])
        
        // Optionally, delete from user_avatars after migrating
        await query('DELETE FROM user_avatars WHERE user_id = $1', [avatar.user_id])
        
        successCount++
      } catch (err) {
        console.error(`Failed to migrate avatar for user ${avatar.user_id}:`, err)
        failCount++
      }
    }

    console.log('Migration complete.')
    console.log(`Successfully migrated: ${successCount}`)
    console.log(`Failed: ${failCount}`)
    
  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    process.exit(0)
  }
}

migrateAvatars()
