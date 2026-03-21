const { normalize } = require("../ai/language")
const { detectVoicePlan } = require("../ai/intentParser")
const { findVoiceChannelByName } = require("../systems/channelManager")
const {
  joinVoice,
  destroyConnection,
  getCurrentVoiceChannel
} = require("./voiceState")

function scoreVoiceChannelMatch(channelName, targetName) {
  const a = normalize(channelName)
  const b = normalize(targetName)

  if (!a || !b) return 0
  if (a === b) return 100
  if (a.includes(b)) return 80
  if (b.includes(a)) return 70

  const aWords = a.split(" ").filter(Boolean)
  const bWords = b.split(" ").filter(Boolean)

  let score = 0

  for (const word of bWords) {
    if (aWords.includes(word)) score += 15
    else if (a.includes(word)) score += 8
  }

  return score
}

function findBestVoiceChannel(guild, requestedName) {
  if (!requestedName) return null

  const exact = findVoiceChannelByName(guild, requestedName)
  if (exact) return exact

  const voiceChannels = guild.channels.cache.filter(
    channel => channel.type === 2
  )

  let best = null
  let bestScore = 0

  for (const channel of voiceChannels.values()) {
    const score = scoreVoiceChannelMatch(channel.name, requestedName)

    if (score > bestScore) {
      best = channel
      bestScore = score
    }
  }

  if (bestScore >= 20) return best
  return null
}

function getAuthorVoiceChannel(message) {
  return message.member?.voice?.channel || null
}

function isAdmin(member) {
  if (!member) return false
  return member.permissions?.has?.("Administrator") || member.guild.ownerId === member.id
}

async function handleVoiceCommand(message, text, language = "en", guildSettings = null) {
  const plan = detectVoicePlan(text, language)

  if (!plan.isVoiceRequest) {
    return null
  }

  const voiceSettings = guildSettings?.voiceCommands || {
    enabled: true,
    adminOnly: true,
    onlyJoinAuthorChannelByDefault: false
  }

  if (!voiceSettings.enabled) {
    return {
      ok: false,
      message: language === "tr" ? "Ses komutları bu sunucuda kapalı." : "Voice commands are disabled in this server."
    }
  }

  if (voiceSettings.adminOnly && !isAdmin(message.member)) {
    return {
      ok: false,
      message: language === "tr" ? "Ses komutları için yönetici olman gerek." : "You need admin permission for voice commands."
    }
  }

  if (plan.action === "leave") {
    const result = destroyConnection(message.guild.id)

    if (language === "tr") {
      if (result.ok) result.message = "Ses kanalından çıkıldı."
      else result.message = "Bot şu an bir ses kanalında değil."
    }

    return result
  }

  let targetChannel = null

  if (plan.channelName) {
    targetChannel = findBestVoiceChannel(message.guild, plan.channelName)
  }

  if (!targetChannel && voiceSettings.onlyJoinAuthorChannelByDefault) {
    targetChannel = getAuthorVoiceChannel(message)
  }

  if (!targetChannel) {
    targetChannel = getAuthorVoiceChannel(message)
  }

  if (!targetChannel) {
    return {
      ok: false,
      message:
        language === "tr"
          ? "Hedef ses kanalı bulunamadı. Bir ses kanalında ol ya da kanal adını daha net yaz."
          : "Target voice channel was not found. Join a voice channel yourself or write the channel name more clearly."
    }
  }

  const current = getCurrentVoiceChannel(message.guild)

  if (current?.id === targetChannel.id) {
    return {
      ok: true,
      message:
        language === "tr"
          ? `Zaten ${targetChannel.name} kanalındayım.`
          : `I am already in ${targetChannel.name}.`
    }
  }

  const result = await joinVoice(message.guild, targetChannel)

  if (language === "tr") {
    if (result.ok) {
      result.message = `${targetChannel.name} ses kanalına geçtim.`
    } else {
      result.message = `${targetChannel.name} ses kanalına giremedim.`
    }
  }

  return result
}

module.exports = {
  handleVoiceCommand,
  findBestVoiceChannel
}