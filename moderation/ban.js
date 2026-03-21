const { addModerationLog } = require("../database/moderationState")

async function banMember(guild, targetId, reason = "Disogle moderation") {
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
      message: "I cannot ban the server owner."
    }
  }

  if (!member.bannable) {
    return {
      ok: false,
      message: "I cannot ban this user."
    }
  }

  await member.ban({ reason })

  addModerationLog(guild.id, {
    type: "ban",
    userId: member.id,
    tag: member.user.tag,
    reason
  })

  return {
    ok: true,
    message: `${member.user.tag} was banned.`
  }
}

module.exports = {
  banMember
}