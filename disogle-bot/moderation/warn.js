const {
  addWarn,
  getUserWarnCount,
  addModerationLog
} = require("../database/moderationState")

async function warnMember(guild, userId, reason) {
  const member = await guild.members.fetch(userId).catch(() => null)
  if (!member) return { ok: false, message: "User not found." }

  const warnCount = addWarn(guild.id, userId, 1)

  addModerationLog(guild.id, {
    type: "warn",
    userId,
    reason: reason || "No reason"
  })

  return {
    ok: true,
    message: `${member.user.tag} warned. Total warns: ${warnCount}`
  }
}

function getWarns(guildId, userId) {
  return getUserWarnCount(guildId, userId)
}

module.exports = {
  warnMember,
  getWarns
}