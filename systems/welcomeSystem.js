const { getGuildSettings } = require("../database/guildSettings")

async function sendWelcomeMessage(member) {
  const settings = getGuildSettings(member.guild.id)

  if (!settings.welcomeEnabled || !settings.welcomeChannelId) {
    return null
  }

  const channel = member.guild.channels.cache.get(settings.welcomeChannelId)
  if (!channel || typeof channel.send !== "function") {
    return null
  }

  const prefersEnglish =
    settings.forcedLanguage === "en" ||
    (!settings.forcedLanguage && settings.defaultLanguage === "en")

  const message = prefersEnglish
    ? `Welcome ${member} to **${member.guild.name}**.`
    : `Hoş geldin ${member}, **${member.guild.name}** sunucusuna katıldın.`

  return await channel.send({
    content: message,
    allowedMentions: {
      users: [member.id]
    }
  })
}

module.exports = {
  sendWelcomeMessage
}