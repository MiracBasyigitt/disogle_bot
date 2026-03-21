async function muteMember(guild, targetId, durationMs, reason) {
  const member = await guild.members.fetch(targetId).catch(() => null)
  if (!member) return { ok: false, message: "User not found." }

  if (!member.moderatable) {
    return { ok: false, message: "I cannot mute this user." }
  }

  await member.timeout(durationMs, reason || "Disogle mute")

  const minutes = Math.round(durationMs / 60000)

  return {
    ok: true,
    message: `${member.user.tag} muted for ${minutes} minutes.`
  }
}

async function unmuteMember(guild, targetId) {
  const member = await guild.members.fetch(targetId).catch(() => null)
  if (!member) return { ok: false, message: "User not found." }

  await member.timeout(null)

  return {
    ok: true,
    message: `${member.user.tag} unmuted.`
  }
}

module.exports = {
  muteMember,
  unmuteMember
}