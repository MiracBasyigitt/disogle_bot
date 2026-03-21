const { ChannelType } = require("discord.js")

function getGuildAnalytics(guild) {
  const textChannels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText).size
  const voiceChannels = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildVoice).size
  const categories = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory).size
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

function formatGuildAnalytics(guild, language = "en") {
  const data = getGuildAnalytics(guild)

  if (language === "tr") {
    return [
      `Sunucu: ${data.guildName}`,
      `Üye: ${data.members}`,
      `Kategori: ${data.categories}`,
      `Yazı kanalı: ${data.textChannels}`,
      `Ses kanalı: ${data.voiceChannels}`,
      `Rol: ${data.roles}`
    ].join("\n")
  }

  return [
    `Server: ${data.guildName}`,
    `Members: ${data.members}`,
    `Categories: ${data.categories}`,
    `Text channels: ${data.textChannels}`,
    `Voice channels: ${data.voiceChannels}`,
    `Roles: ${data.roles}`
  ].join("\n")
}

module.exports = {
  getGuildAnalytics,
  formatGuildAnalytics
}