const { readJson, writeJson } = require("./jsonStore")

const FILE = "userMemory.json"
const cache = readJson(FILE, {})

function createDefaultUserMemory() {
  return {
    languageMode: "auto",
    lastDetectedLanguage: "tr",
    tone: "neutral",
    recentMessages: []
  }
}

function getUserMemory(userId) {
  if (!cache[userId]) {
    cache[userId] = createDefaultUserMemory()
    writeJson(FILE, cache)
  }

  return cache[userId]
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

  if (state.recentMessages.length > 8) {
    state.recentMessages.shift()
  }

  writeJson(FILE, cache)
  return state.recentMessages
}

module.exports = {
  getUserMemory,
  setUserMemory,
  updateUserMemory,
  pushRecentMessage,
  createDefaultUserMemory
}