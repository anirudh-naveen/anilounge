import mongoose from 'mongoose'
import IPBan from './src/models/IPBan.js'
import dotenv from 'dotenv'
import connectDB from './config/database.js'

dotenv.config()

const clearIPBan = async () => {
  try {
    console.log('🔓 Connecting to MongoDB to clear IP ban...')
    await connectDB()

    const ipToUnban = '24.125.97.164' // Your IP from the logs

    console.log(`🔍 Looking for IP ban for: ${ipToUnban}`)

    const ban = await IPBan.findOne({ ip: ipToUnban })

    if (ban) {
      console.log(`❌ Found ban: ${ban.reason}, expires: ${ban.expiresAt}`)
      await IPBan.deleteOne({ ip: ipToUnban })
      console.log(`✅ Successfully removed IP ban for ${ipToUnban}`)
    } else {
      console.log(`✅ No ban found for IP: ${ipToUnban}`)
    }

    // Also clear any other recent bans that might be blocking legitimate traffic
    const recentBans = await IPBan.find({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    })

    if (recentBans.length > 0) {
      console.log(`\n🔍 Found ${recentBans.length} recent bans:`)
      recentBans.forEach((ban) => {
        console.log(`  - IP: ${ban.ip}, Reason: ${ban.reason}, Expires: ${ban.expiresAt}`)
      })

      // Remove bans that are likely false positives
      const falsePositiveReasons = ['bot_detection']
      const falsePositiveBans = recentBans.filter(
        (ban) =>
          falsePositiveReasons.includes(ban.reason) && ban.ip !== '127.0.0.1' && ban.ip !== '::1',
      )

      if (falsePositiveBans.length > 0) {
        console.log(`\n🧹 Removing ${falsePositiveBans.length} likely false positive bans...`)
        await IPBan.deleteMany({
          _id: { $in: falsePositiveBans.map((ban) => ban._id) },
        })
        console.log('✅ False positive bans removed')
      }
    }
  } catch (error) {
    console.error('❌ Error clearing IP ban:', error)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected from MongoDB')
  }
}

clearIPBan()
