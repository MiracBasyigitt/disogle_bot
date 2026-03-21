async function purgeMessages(channel, amount) {
  if (!channel || !channel.bulkDelete) {
    return { ok: false, message: "Cannot purge in this channel." }
  }

  const deleted = await channel.bulkDelete(amount, true).catch(() => null)

  if (!deleted) {
    return { ok: false, message: "Failed to delete messages." }
  }

  return {
    ok: true,
    message: `${deleted.size} messages deleted.`
  }
}

module.exports = { purgeMessages }