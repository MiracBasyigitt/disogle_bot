function getGuildAnalytics(guild) {
  const textChannels = guild.channels.cache.filter(channel => channel.isTextBased?.()).size
  const voiceChannels = guild.channels.cache.filter(channel => channel.isVoiceBased?.()).size
  const categories = guild.channels.cache.filter(channel => channel.type === 4).size
  const roles = guild.roles.cache.size
  const members = guild.memberCount

  return {
    guildName: guild.name,
    members,
    textChannels,
    voiceChannels,
    categories,
    roles
  }
}

function formatGuildAnalytics(guild, language = "tr") {
  const data = getGuildAnalytics(guild)

  if (language === "en") {
    return [
      `Server: ${data.guildName}`,
      `Members: ${data.members}`,
      `Categories: ${data.categories}`,
      `Text channels: ${data.textChannels}`,
      `Voice channels: ${data.voiceChannels}`,
      `Roles: ${data.roles}`
    ].join("\n")
  }

  return [
    `Sunucu: ${data.guildName}`,
    `Üye: ${data.members}`,
    `Kategori: ${data.categories}`,
    `Yazı kanalı: ${data.textChannels}`,
    `Ses kanalı: ${data.voiceChannels}`,
    `Rol: ${data.roles}`
  ].join("\n")
}

module.exports = {
  getGuildAnalytics,
  formatGuildAnalytics
}