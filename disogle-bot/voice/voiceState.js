const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState
} = require("@discordjs/voice")

const activeConnections = new Map()

async function joinVoice(guild, channel) {
  if (!channel || !channel.id) {
    return {
      ok: false,
      message: "Voice channel not found."
    }
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator
  })

  activeConnections.set(guild.id, connection)

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15000)
  } catch {
    connection.destroy()
    activeConnections.delete(guild.id)

    return {
      ok: false,
      message: "Failed to join voice channel."
    }
  }

  return {
    ok: true,
    message: `Joined voice: ${channel.name}`
  }
}

function leaveVoice(guildId) {
  const connection = activeConnections.get(guildId)
  if (!connection) {
    return {
      ok: false,
      message: "Not in a voice channel."
    }
  }

  connection.destroy()
  activeConnections.delete(guildId)

  return {
    ok: true,
    message: "Left voice channel."
  }
}

function getConnection(guildId) {
  return activeConnections.get(guildId) || null
}

module.exports = {
  joinVoice,
  leaveVoice,
  getConnection
}