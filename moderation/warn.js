const {
  addWarn,
  removeWarn,
  clearWarns,
  getUserWarnCount,
  addModerationLog,
  findAutoPunishment,
  getModerationState
} = require("../database/moderationState")

const { muteMember } = require("./mute")
const { kickMember } = require("./kick")
const { banMember } = require("./ban")

async function applyAutoPunishment(guild, userId, warnCount) {
  const state = getModerationState(guild.id)

  if (!state.settings?.warnSystemEnabled) {
    return null
  }

  const rule = findAutoPunishment(guild.id, warnCount)
  if (!rule) return null

  if (rule.action === "mute") {
    return await muteMember(
      guild,
      userId,
      rule.durationMs || 15 * 60 * 1000,
      `Auto punishment at ${warnCount} warns`
    )
  }

  if (rule.action === "kick") {
    return await kickMember(
      guild,
      userId,
      `Auto punishment at ${warnCount} warns`
    )
  }

  if (rule.action === "ban") {
    return await banMember(
      guild,
      userId,
      `Auto punishment at ${warnCount} warns`
    )
  }

  return null
}

async function warnMember(guild, userId, reason = "No reason provided") {
  const member = await guild.members.fetch(userId).catch(() => null)

  if (!member) {
    return {
      ok: false,
      message: "User not found."
    }
  }

  const warnCount = addWarn(guild.id, userId, 1)

  addModerationLog(guild.id, {
    type: "warn",
    userId,
    tag: member.user.tag,
    reason,
    totalWarns: warnCount
  })

  const autoResult = await applyAutoPunishment(guild, userId, warnCount)

  if (autoResult?.ok) {
    return {
      ok: true,
      message: `${member.user.tag} was warned. Total warns: ${warnCount}. Auto action: ${autoResult.message}`
    }
  }

  return {
    ok: true,
    message: `${member.user.tag} was warned. Total warns: ${warnCount}.`
  }
}

async function unwarnMember(guild, userId, amount = 1, reason = "Warn removed") {
  const member = await guild.members.fetch(userId).catch(() => null)

  if (!member) {
    return {
      ok: false,
      message: "User not found."
    }
  }

  const warnCount = removeWarn(guild.id, userId, amount)

  addModerationLog(guild.id, {
    type: "unwarn",
    userId,
    tag: member.user.tag,
    reason,
    totalWarns: warnCount
  })

  return {
    ok: true,
    message: `${member.user.tag} warn count is now ${warnCount}.`
  }
}

async function clearMemberWarns(guild, userId, reason = "Warns cleared") {
  const member = await guild.members.fetch(userId).catch(() => null)

  if (!member) {
    return {
      ok: false,
      message: "User not found."
    }
  }

  clearWarns(guild.id, userId)

  addModerationLog(guild.id, {
    type: "clear_warns",
    userId,
    tag: member.user.tag,
    reason,
    totalWarns: 0
  })

  return {
    ok: true,
    message: `${member.user.tag} warns were cleared.`
  }
}

function getWarns(guildId, userId) {
  return getUserWarnCount(guildId, userId)
}

module.exports = {
  warnMember,
  unwarnMember,
  clearMemberWarns,
  getWarns,
  applyAutoPunishment
}