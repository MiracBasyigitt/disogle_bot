const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  getVoiceConnection
} = require("@discordjs/voice")

function getConnection(guildId) {
  return getVoiceConnection(guildId) || null
}

function destroyConnection(guildId) {
  const connection = getConnection(guildId)

  if (!connection) {
    return {
      ok: false,
      message: "Not connected to any voice channel."
    }
  }

  try {
    connection.destroy()
  } catch {}

  return {
    ok: true,
    message: "Disconnected from voice."
  }
}

async function joinVoice(guild, voiceChannel) {
  if (!guild || !voiceChannel) {
    return {
      ok: false,
      message: "Voice channel not found."
    }
  }

  const existing = getConnection(guild.id)

  if (existing?.joinConfig?.channelId === voiceChannel.id) {
    return {
      ok: true,
      message: `Already in ${voiceChannel.name}.`
    }
  }

  if (existing) {
    try {
      existing.destroy()
    } catch {}
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  })

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15000)

    return {
      ok: true,
      message: `Joined voice channel: ${voiceChannel.name}`,
      channel: voiceChannel
    }
  } catch {
    try {
      connection.destroy()
    } catch {}

    return {
      ok: false,
      message: `Failed to join voice channel: ${voiceChannel.name}`
    }
  }
}

function getCurrentVoiceChannel(guild) {
  const connection = getConnection(guild.id)
  if (!connection) return null
  return guild.channels.cache.get(connection.joinConfig.channelId) || null
}

module.exports = {
  getConnection,
  destroyConnection,
  joinVoice,
  getCurrentVoiceChannel
}