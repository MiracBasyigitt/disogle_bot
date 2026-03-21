const { readJson, writeJson } = require("./jsonStore")

const FILE = "guildSettings.json"
const cache = readJson(FILE, {})

function createDefaultGuildSettings() {
  return {
    defaultLanguage: "en",
    forcedLanguage: null,
    chatCooldownMs: 1200,

    welcomeEnabled: false,
    welcomeChannelId: null,
    autoRoleId: null,

    spamProtection: {
      enabled: true,
      maxMessages: 6,
      perSeconds: 8,
      muteMinutes: 15
    },

    moderation: {
      logChannelId: null,
      warnSystemEnabled: true
    },

    builder: {
      defaultMode: "community",
      includeRoles: true,
      includeWelcome: true,
      includeVoice: true,
      englishLayoutByDefault: true
    },

    voiceCommands: {
      enabled: true,
      adminOnly: true,
      onlyJoinAuthorChannelByDefault: false
    },

    ai: {
      executionBias: true,
      smartSuggestions: false,
      englishPriority: true
    }
  }
}

function getGuildSettings(guildId) {
  if (!cache[guildId]) {
    cache[guildId] = createDefaultGuildSettings()
    writeJson(FILE, cache)
  }

  const current = cache[guildId]

  if (!current.defaultLanguage) current.defaultLanguage = "en"
  if (!current.spamProtection) current.spamProtection = createDefaultGuildSettings().spamProtection
  if (!current.moderation) current.moderation = createDefaultGuildSettings().moderation
  if (!current.builder) current.builder = createDefaultGuildSettings().builder
  if (!current.voiceCommands) current.voiceCommands = createDefaultGuildSettings().voiceCommands
  if (!current.ai) current.ai = createDefaultGuildSettings().ai

  writeJson(FILE, cache)
  return current
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