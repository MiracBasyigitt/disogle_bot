const spamMap = new Map()

function checkSpam(message, settings) {
  const userId = message.author.id
  const now = Date.now()

  if (!spamMap.has(userId)) {
    spamMap.set(userId, [])
  }

  const timestamps = spamMap.get(userId)
  timestamps.push(now)

  const filtered = timestamps.filter(
    t => now - t < settings.perSeconds * 1000
  )

  spamMap.set(userId, filtered)

  if (filtered.length >= settings.maxMessages) {
    return true
  }

  return false
}

module.exports = {
  checkSpam
}