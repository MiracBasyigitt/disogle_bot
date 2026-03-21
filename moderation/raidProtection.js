const userSpamMap = new Map()
const guildRaidMap = new Map()

function getNow() {
  return Date.now()
}

function cleanupTimestamps(list, maxAgeMs) {
  const now = getNow()
  return list.filter(item => now - item < maxAgeMs)
}

function checkSpam(message, settings) {
  const userId = message.author.id
  const now = getNow()

  if (!userSpamMap.has(userId)) {
    userSpamMap.set(userId, [])
  }

  const timestamps = userSpamMap.get(userId)
  timestamps.push(now)

  const filtered = cleanupTimestamps(
    timestamps,
    Number(settings.perSeconds || 8) * 1000
  )

  userSpamMap.set(userId, filtered)

  return filtered.length >= Number(settings.maxMessages || 6)
}

function trackJoinForRaid(guildId) {
  const now = getNow()

  if (!guildRaidMap.has(guildId)) {
    guildRaidMap.set(guildId, [])
  }

  const joins = guildRaidMap.get(guildId)
  joins.push(now)

  const filtered = cleanupTimestamps(joins, 30 * 1000)
  guildRaidMap.set(guildId, filtered)

  return filtered.length
}

function detectRaid(guildId, threshold = 8) {
  const joins = guildRaidMap.get(guildId) || []
  return joins.length >= threshold
}

function resetGuildRaid(guildId) {
  guildRaidMap.delete(guildId)
}

module.exports = {
  checkSpam,
  trackJoinForRaid,
  detectRaid,
  resetGuildRaid
}