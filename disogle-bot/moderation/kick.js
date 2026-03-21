async function kickMember(guild, targetId, reason) {
  const member = await guild.members.fetch(targetId).catch(() => null)
  if (!member) return { ok: false, message: "User not found." }

  if (!member.kickable) {
    return { ok: false, message: "I cannot kick this user." }
  }

  await member.kick(reason || "Disogle moderation")

  return {
    ok: true,
    message: `${member.user.tag} kicked.`
  }
}

module.exports = { kickMember }