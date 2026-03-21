async function banMember(guild, targetId, reason) {
  const member = await guild.members.fetch(targetId).catch(() => null)
  if (!member) return { ok: false, message: "User not found." }

  if (!member.bannable) {
    return { ok: false, message: "I cannot ban this user." }
  }

  await member.ban({ reason: reason || "Disogle moderation" })

  return {
    ok: true,
    message: `${member.user.tag} banned.`
  }
}

module.exports = { banMember }