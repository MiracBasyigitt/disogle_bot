const { readJson, writeJson } = require("./jsonStore")

const FILE = "moderationState.json"
const cache = readJson(FILE, {})

function createDefaultModerationState() {
  return {
    warns: {},
    mutedUsers: {},
    bannedUsers: {},
    logs: [],
    settings: {
      warnSystemEnabled: true,
      autoPunishments: [
        {
          warnCount: 3,
          action: "mute",
          durationMs: 15 * 60 * 1000
        },
        {
          warnCount: 5,
          action: "kick",
          durationMs: null
        },
        {
          warnCount: 7,
          action: "ban",
          durationMs: null
        }
      ]
    }
  }
}

function getModerationState(guildId) {
  if (!cache[guildId]) {
    cache[guildId] = createDefaultModerationState()
    writeJson(FILE, cache)
  }

  return cache[guildId]
}

function setModerationState(guildId, patch) {
  const current = getModerationState(guildId)
  cache[guildId] = {
    ...current,
    ...patch
  }
  writeJson(FILE, cache)
  return cache[guildId]
}

function updateModerationState(guildId, updater) {
  const current = getModerationState(guildId)
  const next = typeof updater === "function" ? updater(current) : current
  cache[guildId] = next
  writeJson(FILE, cache)
  return cache[guildId]
}

function getUserWarnCount(guildId, userId) {
  const state = getModerationState(guildId)
  return Number(state.warns[userId] || 0)
}

function addWarn(guildId, userId, amount = 1) {
  const state = getModerationState(guildId)
  state.warns[userId] = Number(state.warns[userId] || 0) + Number(amount || 1)
  writeJson(FILE, cache)
  return state.warns[userId]
}

function removeWarn(guildId, userId, amount = 1) {
  const state = getModerationState(guildId)
  state.warns[userId] = Math.max(0, Number(state.warns[userId] || 0) - Number(amount || 1))
  writeJson(FILE, cache)
  return state.warns[userId]
}

function clearWarns(guildId, userId) {
  const state = getModerationState(guildId)
  state.warns[userId] = 0
  writeJson(FILE, cache)
  return 0
}

function addModerationLog(guildId, entry) {
  const state = getModerationState(guildId)
  state.logs.unshift({
    ...entry,
    createdAt: new Date().toISOString()
  })

  if (state.logs.length > 200) {
    state.logs = state.logs.slice(0, 200)
  }

  writeJson(FILE, cache)
  return state.logs
}

module.exports = {
  getModerationState,
  setModerationState,
  updateModerationState,
  getUserWarnCount,
  addWarn,
  removeWarn,
  clearWarns,
  addModerationLog,
  createDefaultModerationState
}