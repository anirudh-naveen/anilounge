import crypto from 'crypto'

// Simple challenge-response system to deter bots
export const challengeResponse = (req, res, next) => {
  // Skip challenge for authenticated users
  if (req.user) {
    return next()
  }

  // Skip challenge for certain endpoints
  const skipEndpoints = ['/health', '/api/auth/refresh', '/api/auth/revoke']
  if (skipEndpoints.some((endpoint) => req.path.startsWith(endpoint))) {
    return next()
  }

  // Check if challenge was completed
  const challengeToken = req.headers['x-challenge-token']
  const challengeAnswer = req.headers['x-challenge-answer']

  if (challengeToken && challengeAnswer) {
    // Verify challenge
    const expectedAnswer = generateChallengeAnswer(challengeToken)
    if (challengeAnswer === expectedAnswer) {
      return next()
    }
  }

  // Generate new challenge
  const challenge = generateChallenge()

  res.status(202).json({
    success: false,
    message: 'Challenge required',
    challenge: {
      question: challenge.question,
      token: challenge.token,
    },
  })
}

// Generate a simple math challenge
const generateChallenge = () => {
  const a = Math.floor(Math.random() * 10) + 1
  const b = Math.floor(Math.random() * 10) + 1
  const operation = Math.random() > 0.5 ? '+' : '-'

  let question, answer
  if (operation === '+') {
    question = `${a} + ${b} = ?`
    answer = a + b
  } else {
    question = `${a} - ${b} = ?`
    answer = a - b
  }

  const token = crypto.randomBytes(16).toString('hex')

  // Store answer temporarily (in production, use Redis)
  if (!global.challengeStore) global.challengeStore = new Map()
  global.challengeStore.set(token, answer)

  // Clean up old challenges
  setTimeout(
    () => {
      global.challengeStore.delete(token)
    },
    5 * 60 * 1000,
  ) // 5 minutes

  return { question, token }
}

// Generate challenge answer
const generateChallengeAnswer = (token) => {
  if (!global.challengeStore) return null
  return global.challengeStore.get(token)
}

// Verify challenge answer
export const verifyChallenge = (req, res, next) => {
  const challengeToken = req.headers['x-challenge-token']
  const challengeAnswer = req.headers['x-challenge-answer']

  if (!challengeToken || !challengeAnswer) {
    return res.status(400).json({
      success: false,
      message: 'Challenge token and answer required',
    })
  }

  const expectedAnswer = generateChallengeAnswer(challengeToken)
  if (!expectedAnswer || parseInt(challengeAnswer) !== expectedAnswer) {
    return res.status(400).json({
      success: false,
      message: 'Invalid challenge answer',
    })
  }

  // Clear used challenge
  global.challengeStore.delete(challengeToken)
  next()
}

export default {
  challengeResponse,
  verifyChallenge,
}
