const { addModerationLog } = require("../database/moderationState")

async function muteMember(guild, targetId, durationMs, reason = "Disogle mute") {
  const member = await guild.members.fetch(targetId).catch(() => null)

  if (!member) {
    return {
      ok: false,
      message: "User not found."
    }
  }

  if (guild.ownerId === member.id) {
    return {
      ok: false,
      message: "I cannot mute the server owner."
    }
  }

  if (!member.moderatable) {
    return {
      ok: false,
      message: "I cannot mute this user."
    }
  }

  const safeDuration = Math.max(5000, Math.min(28 * 24 * 60 * 60 * 1000, Number(durationMs || 15 * 60 * 1000)))

  await member.timeout(safeDuration, reason)

  const minutes = Math.round(safeDuration / 60000)

  addModerationLog(guild.id, {
    type: "mute",
    userId: member.id,
    tag: member.user.tag,
    reason,
    durationMs: safeDuration
  })

  return {
    ok: true,
    message: `${member.user.tag} was muted for ${minutes} minute(s).`
  }
}

async function unmuteMember(guild, targetId, reason = "Disogle unmute") {
  const member = await guild.members.fetch(targetId).catch(() => null)

  if (!member) {
    return {
      ok: false,
      message: "User not found."
    }
  }

  if (!member.moderatable) {
    return {
      ok: false,
      message: "I cannot unmute this user."
    }
  }

  await member.timeout(null, reason)

  addModerationLog(guild.id, {
    type: "unmute",
    userId: member.id,
    tag: member.user.tag,
    reason
  })

  return {
    ok: true,
    message: `${member.user.tag} was unmuted.`
  }
}

module.exports = {
  muteMember,
  unmuteMember
}