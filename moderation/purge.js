const { addModerationLog } = require("../database/moderationState")

async function purgeMessages(channel, amount, actorId = null) {
  if (!channel || typeof channel.bulkDelete !== "function") {
    return {
      ok: false,
      message: "Bulk delete is not available in this channel."
    }
  }

  const safeAmount = Math.max(1, Math.min(100, Number(amount || 1)))

  const deleted = await channel.bulkDelete(safeAmount, true).catch(() => null)

  if (!deleted) {
    return {
      ok: false,
      message: "Failed to delete messages."
    }
  }

  try {
    addModerationLog(channel.guild.id, {
      type: "purge",
      channelId: channel.id,
      amount: deleted.size,
      actorId
    })
  } catch {}

  return {
    ok: true,
    message: `Deleted ${deleted.size} message(s).`
  }
}

module.exports = {
  purgeMessages
}