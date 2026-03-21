const { addModerationLog } = require("../database/moderationState")

async function kickMember(guild, targetId, reason = "Disogle moderation") {
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
      message: "I cannot kick the server owner."
    }
  }

  if (!member.kickable) {
    return {
      ok: false,
      message: "I cannot kick this user."
    }
  }

  await member.kick(reason)

  addModerationLog(guild.id, {
    type: "kick",
    userId: member.id,
    tag: member.user.tag,
    reason
  })

  return {
    ok: true,
    message: `${member.user.tag} was kicked.`
  }
}

module.exports = {
  kickMember
}