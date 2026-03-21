const { readJson, writeJson } = require("./jsonStore")

const FILE = "guildSettings.json"
const cache = readJson(FILE, {})

function createDefaultGuildSettings() {
  return {
    chatCooldownMs: 1200,
    forcedLanguage: null,
    welcomeEnabled: false,
    welcomeChannelId: null,
    spamProtection: {
      enabled: true,
      maxMessages: 6,
      perSeconds: 8,
      muteMinutes: 15
    },
    voiceCommands: {
      enabled: false,
      adminOnly: true
    }
  }
}

function getGuildSettings(guildId) {
  if (!cache[guildId]) {
    cache[guildId] = createDefaultGuildSettings()
    writeJson(FILE, cache)
  }

  return cache[guildId]
}

function setGuildSettings(guildId, patch) {
  const current = getGuildSettings(guildId)
  cache[guildId] = {
    ...current,
    ...patch
  }
  writeJson(FILE, cache)
  return cache[guildId]
}

function updateGuildSettings(guildId, updater) {
  const current = getGuildSettings(guildId)
  const next = typeof updater === "function" ? updater(current) : current
  cache[guildId] = next
  writeJson(FILE, cache)
  return cache[guildId]
}

module.exports = {
  getGuildSettings,
  setGuildSettings,
  updateGuildSettings,
  createDefaultGuildSettings
}