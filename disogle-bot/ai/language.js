function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^\p{L}\p{N}\s#@_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compact(text) {
  return normalize(text).replace(/\s+/g, "")
}

function getLanguage(text) {
  const value = normalize(text)

  const trHints = [
    "kategori", "kanal", "olustur", "sil", "degistir", "tasi", "izin", "banla",
    "mute", "sustur", "kick", "mesaj", "temizle", "kur", "sesli", "rol", "sunucu"
  ]

  const enHints = [
    "category", "channel", "create", "delete", "rename", "move", "permission",
    "ban", "mute", "kick", "message", "purge", "server", "voice", "role"
  ]

  const trScore = trHints.filter(x => value.includes(x)).length
  const enScore = enHints.filter(x => value.includes(x)).length

  if (trScore > enScore) return "tr"
  if (enScore > trScore) return "en"
  if (/[çğıöşüÇĞİÖŞÜ]/.test(String(text || ""))) return "tr"
  return "en"
}

function hasTrigger(message, botId, botName) {
  const content = String(message.content || "")
  const lowered = content.toLowerCase()

  const isMentioned = message.mentions.has(botId)
  const isReply =
    message.reference?.messageId &&
    message.mentions?.repliedUser &&
    message.mentions.repliedUser.id === botId

  const hasName = lowered.includes(String(botName || "").toLowerCase())

  return isMentioned || isReply || hasName
}

function stripTrigger(message, botId, botName) {
  let content = String(message.content || "")
  content = content.replace(new RegExp(`<@!?${botId}>`, "g"), " ")
  content = content.replace(new RegExp(String(botName || ""), "ig"), " ")
  return content.replace(/\s+/g, " ").trim()
}

module.exports = {
  normalize,
  compact,
  getLanguage,
  hasTrigger,
  stripTrigger
}