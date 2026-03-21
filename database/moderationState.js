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

  const state = cache[guildId]

  if (!state.warns) state.warns = {}
  if (!state.mutedUsers) state.mutedUsers = {}
  if (!state.bannedUsers) state.bannedUsers = {}
  if (!state.logs) state.logs = []
  if (!state.settings) state.settings = createDefaultModerationState().settings

  writeJson(FILE, cache)
  return state
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

  if (state.logs.length > 300) {
    state.logs = state.logs.slice(0, 300)
  }

  writeJson(FILE, cache)
  return state.logs
}

function findAutoPunishment(guildId, warnCount) {
  const state = getModerationState(guildId)
  const rules = Array.isArray(state.settings?.autoPunishments)
    ? [...state.settings.autoPunishments]
    : []

  rules.sort((a, b) => Number(a.warnCount || 0) - Number(b.warnCount || 0))

  let matched = null

  for (const rule of rules) {
    if (warnCount >= Number(rule.warnCount || 0)) {
      matched = rule
    }
  }

  return matched
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
  findAutoPunishment,
  createDefaultModerationState
}