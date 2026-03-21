const { readJson, writeJson } = require("./jsonStore")

const FILE = "userMemory.json"
const cache = readJson(FILE, {})

function createDefaultUserMemory() {
  return {
    languageMode: "auto",
    preferredLanguage: "en",
    lastDetectedLanguage: "en",
    tone: "neutral",
    recentMessages: [],
    lastIntent: null,
    profile: {
      likesEnglish: true,
      usesManagementCommands: false,
      usesVoiceCommands: false
    }
  }
}

function getUserMemory(userId) {
  if (!cache[userId]) {
    cache[userId] = createDefaultUserMemory()
    writeJson(FILE, cache)
  }

  const state = cache[userId]

  if (!state.languageMode) state.languageMode = "auto"
  if (!state.preferredLanguage) state.preferredLanguage = "en"
  if (!state.lastDetectedLanguage) state.lastDetectedLanguage = "en"
  if (!state.tone) state.tone = "neutral"
  if (!Array.isArray(state.recentMessages)) state.recentMessages = []
  if (!state.profile) state.profile = createDefaultUserMemory().profile

  writeJson(FILE, cache)
  return state
}

function setUserMemory(userId, patch) {
  const current = getUserMemory(userId)

  cache[userId] = {
    ...current,
    ...patch
  }

  writeJson(FILE, cache)
  return cache[userId]
}

function updateUserMemory(userId, updater) {
  const current = getUserMemory(userId)
  const next = typeof updater === "function" ? updater(current) : current
  cache[userId] = next
  writeJson(FILE, cache)
  return cache[userId]
}

function pushRecentMessage(userId, content) {
  const state = getUserMemory(userId)
  state.recentMessages.push(String(content || ""))

  if (state.recentMessages.length > 10) {
    state.recentMessages.shift()
  }

  writeJson(FILE, cache)
  return state.recentMessages
}

function setLastIntent(userId, intentName) {
  const state = getUserMemory(userId)
  state.lastIntent = intentName || null
  writeJson(FILE, cache)
  return state.lastIntent
}

module.exports = {
  getUserMemory,
  setUserMemory,
  updateUserMemory,
  pushRecentMessage,
  setLastIntent,
  createDefaultUserMemory
}