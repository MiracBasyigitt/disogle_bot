const { joinVoice, leaveVoice } = require("./voiceState")

function detectVoiceJoin(message, text) {
  const value = text.toLowerCase()

  if (
    value.includes("voice gel") ||
    value.includes("ses gel") ||
    value.includes("join voice") ||
    value.includes("come voice")
  ) {
    return true
  }

  return false
}

function detectVoiceLeave(text) {
  const value = text.toLowerCase()

  if (
    value.includes("voice çık") ||
    value.includes("sesten çık") ||
    value.includes("leave voice") ||
    value.includes("disconnect")
  ) {
    return true
  }

  return false
}

async function handleVoiceCommand(message, text) {
  if (detectVoiceJoin(message, text)) {
    const channel = message.member.voice.channel

    if (!channel) {
      return {
        ok: false,
        message: "You must be in a voice channel."
      }
    }

    return await joinVoice(message.guild, channel)
  }

  if (detectVoiceLeave(text)) {
    return leaveVoice(message.guild.id)
  }

  return null
}

module.exports = {
  handleVoiceCommand
}