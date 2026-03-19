require("dotenv").config()

const fs = require("fs")
const path = require("path")
const {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType
} = require("discord.js")
const OpenAI = require("openai")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  allowedMentions: {
    repliedUser: false
  }
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const MODEL = process.env.MODEL || "gpt-5.4"
const BOT_NAME = "Disogle"
const FOUNDER_NAME = "Miraç Başyiğit"

const BOT_IDENTITY_TR =
  "Disogle, Miraç Başyiğit tarafından geliştirilen yapay zeka tabanlı bir Discord botudur. Soruları yanıtlayabilir, metin üretebilir, kod yazabilir, oyun oynatabilir, rol yönetebilir ve sunucu yapısını yönetebilir."

const BOT_IDENTITY_EN =
  "Disogle is an AI-based Discord bot developed by Miraç Başyiğit. It can answer questions, generate text, write code, host games, manage roles, and manage server structure."

const DATA_DIR = path.join(__dirname, "data")
const GUILD_SETTINGS_FILE = path.join(DATA_DIR, "guildSettings.json")
const USER_MEMORY_FILE = path.join(DATA_DIR, "userMemory.json")

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8")
      return fallback
    }
    const raw = fs.readFileSync(file, "utf8")
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8")
  } catch {}
}

const persistedGuildSettings = readJson(GUILD_SETTINGS_FILE, {})
const persistedUserMemory = readJson(USER_MEMORY_FILE, {})

const repliedMessages = new Set()
const userCooldowns = new Map()
const greetedUsers = new Set()
const activeGames = new Map()

const riddles = [
  {
    questionTR: "Konuşmadan anlatırım, ağzım yoktur. Ben neyim?",
    answerTR: "kitap",
    questionEN: "I can tell stories without speaking. I have no mouth. What am I?",
    answerEN: "book"
  },
  {
    questionTR: "Dişlerim vardır ama ısıramam. Ben neyim?",
    answerTR: "tarak",
    questionEN: "I have teeth but cannot bite. What am I?",
    answerEN: "comb"
  },
  {
    questionTR: "Kırıldıkça kullanılan şey nedir?",
    answerTR: "yumurta",
    questionEN: "What gets used more the more it is broken?",
    answerEN: "egg"
  },
  {
    questionTR: "Kanatları yok ama uçar, ağzı yok ama söyler. Nedir?",
    answerTR: "rüzgar",
    questionEN: "It has no wings but flies, no mouth but whispers. What is it?",
    answerEN: "wind"
  }
]

const triviaTR = [
  { q: "Türkiye'nin başkenti neresidir?", a: "ankara" },
  { q: "Dünyanın en büyük okyanusu hangisidir?", a: "pasifik" },
  { q: "2 + 2 x 2 kaç eder?", a: "6" },
  { q: "Güneş sistemindeki en büyük gezegen hangisidir?", a: "jupiter" }
]

const triviaEN = [
  { q: "What is the capital of France?", a: "paris" },
  { q: "Which planet is known as the Red Planet?", a: "mars" },
  { q: "What is 2 + 2 x 2?", a: "6" },
  { q: "What is the largest planet in the Solar System?", a: "jupiter" }
]

const wouldYouRatherTR = [
  "Zihin okuyabilmek mi, görünmez olmak mı?",
  "Hiç uyumamak mı, hiç para derdi çekmemek mi?",
  "Geçmişe gitmek mi, geleceği görmek mi?",
  "Çok zeki olmak mı, çok karizmatik olmak mı?"
]

const wouldYouRatherEN = [
  "Would you rather read minds or become invisible?",
  "Would you rather never need sleep or never worry about money?",
  "Would you rather travel to the past or see the future?",
  "Would you rather be extremely smart or extremely charismatic?"
]

const COLOR_ALIASES = {
  tr: {
    mor: "#8000ff",
    lila: "#b57edc",
    pembe: "#ff4fa3",
    kirmizi: "#ff3b30",
    kırmızı: "#ff3b30",
    mavi: "#3b82f6",
    lacivert: "#1e3a8a",
    turkuaz: "#22d3ee",
    yesil: "#22c55e",
    yeşil: "#22c55e",
    sari: "#facc15",
    sarı: "#facc15",
    turuncu: "#fb923c",
    beyaz: "#ffffff",
    siyah: "#111111",
    gri: "#6b7280",
    grii: "#6b7280"
  },
  en: {
    purple: "#8000ff",
    violet: "#8b5cf6",
    pink: "#ff4fa3",
    red: "#ff3b30",
    blue: "#3b82f6",
    navy: "#1e3a8a",
    cyan: "#22d3ee",
    green: "#22c55e",
    yellow: "#facc15",
    orange: "#fb923c",
    white: "#ffffff",
    black: "#111111",
    gray: "#6b7280",
    grey: "#6b7280"
  }
}

function getGuildSettings(guildId) {
  if (!persistedGuildSettings[guildId]) {
    persistedGuildSettings[guildId] = {
      forcedLanguage: null,
      forcedLanguageBy: null,
      welcomeEnabled: false,
      welcomeChannelId: null
    }
    writeJson(GUILD_SETTINGS_FILE, persistedGuildSettings)
  }
  return persistedGuildSettings[guildId]
}

function saveGuildSettings() {
  writeJson(GUILD_SETTINGS_FILE, persistedGuildSettings)
}

function getUserState(userId) {
  if (!persistedUserMemory[userId]) {
    persistedUserMemory[userId] = {
      languageMode: "auto",
      lastDetectedLanguage: "tr",
      tone: "neutral",
      recentMessages: []
    }
    writeJson(USER_MEMORY_FILE, persistedUserMemory)
  }
  return persistedUserMemory[userId]
}

function saveUserMemory() {
  writeJson(USER_MEMORY_FILE, persistedUserMemory)
}

function saveUserMessage(userId, content) {
  const state = getUserState(userId)
  state.recentMessages.push(String(content || ""))
  if (state.recentMessages.length > 8) state.recentMessages.shift()
  saveUserMemory()
}

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
    .replace(/[^\p{L}\p{N}\s#-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compact(text) {
  return normalize(text).replace(/\s+/g, "")
}

function slugify(input) {
  return normalize(input)
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90)
}

function titleCaseRoleName(input) {
  return String(input || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 100)
}

function uniqueArray(arr) {
  return [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))]
}

function splitSmart(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(Boolean)
}

function cleanMention(content, botId) {
  return String(content || "").replace(new RegExp(`<@!?${botId}>`, "g"), "").trim()
}

function hasBotNameTrigger(content) {
  const lower = String(content || "").toLowerCase()
  return lower.includes(BOT_NAME.toLowerCase())
}

function isReplyToBot(message) {
  return (
    message.reference?.messageId &&
    message.mentions?.repliedUser &&
    message.mentions.repliedUser.id === client.user.id
  )
}

function shouldRespond(message) {
  if (message.author.bot) return false
  if (!message.guild) return false
  return (
    message.mentions.has(client.user) ||
    isReplyToBot(message) ||
    hasBotNameTrigger(message.content)
  )
}

function isOnCooldown(userId) {
  const now = Date.now()
  const expiresAt = userCooldowns.get(userId)
  if (!expiresAt) return false
  if (now >= expiresAt) {
    userCooldowns.delete(userId)
    return false
  }
  return true
}

function setCooldown(userId, ms) {
  userCooldowns.set(userId, Date.now() + ms)
}

function detectLanguage(text) {
  const lower = normalize(text)

  const trHints = [
    "merhaba", "selam", "neden", "nasil", "kurucun", "ozel", "konus",
    "turkce", "kanal", "kategori", "sil", "degistir", "olustur",
    "rol", "renk", "yardim", "aciklama", "sunucu", "oyun", "bilmece",
    "ver", "bana", "olsun", "hepsinin", "adinda", "adli", "yap"
  ]

  const enHints = [
    "hello", "what", "why", "how", "founder", "private", "talk",
    "english", "channel", "category", "delete", "rename", "create",
    "role", "color", "server", "game", "riddle", "help", "description",
    "give", "make", "set", "under", "inside", "all", "with"
  ]

  const trScore = trHints.filter(h => lower.includes(h)).length
  const enScore = enHints.filter(h => lower.includes(h)).length

  if (trScore > enScore) return "tr"
  if (enScore > trScore) return "en"
  if (/[çğıöşüÇĞİÖŞÜ]/.test(String(text || ""))) return "tr"
  return "en"
}

function resolveLanguage(guildId, userId, text) {
  const guildSettings = getGuildSettings(guildId)
  if (guildSettings.forcedLanguage === "tr") return "tr"
  if (guildSettings.forcedLanguage === "en") return "en"

  const state = getUserState(userId)

  if (state.languageMode === "tr") return "tr"
  if (state.languageMode === "en") return "en"

  const detected = detectLanguage(text)
  state.lastDetectedLanguage = detected
  saveUserMemory()
  return detected
}

function detectTone(text) {
  const lower = String(text || "").toLowerCase()
  if (lower.includes("üzgün") || lower.includes("kötü") || lower.includes("berbat") || lower.includes("sad")) return "soft"
  if (lower.includes("haha") || lower.includes("jsjs") || lower.includes("lol") || lower.includes("gül") || lower.includes("lan")) return "casual"
  if (/[!?]{2,}/.test(text) || lower.includes("wow") || lower.includes("inanılmaz")) return "excited"
  if (lower.includes("yardım") || lower.includes("help")) return "helpful"
  return "neutral"
}

function getReplyProfile(text) {
  const len = String(text || "").trim().length
  if (len <= 8) return { maxTokens: 70, style: "very_short" }
  if (len <= 20) return { maxTokens: 110, style: "short" }
  if (len <= 80) return { maxTokens: 220, style: "medium" }
  return { maxTokens: 400, style: "detailed" }
}

function isLowSignal(text) {
  const clean = normalize(text)
  if (!clean) return true
  if (clean.length <= 1) return true
  if (/^(lan|la|hee|he|hm|hmm|ok|tamam|yo|yok|evet|hayir|xd|lol)$/i.test(clean)) return true
  return false
}

function asksAboutFounder(text) {
  const lower = normalize(text)
  return [
    "who is your founder",
    "who made you",
    "who created you",
    "who built you",
    "who owns you",
    "founder",
    "creator",
    "kurucun kim",
    "seni kim yapti",
    "seni kim gelistirdi",
    "kurucu kim"
  ].some(trigger => lower.includes(normalize(trigger)))
}

function asksWhatAreYou(text) {
  const lower = normalize(text)
  return [
    "what are you",
    "who are you",
    "what do you do",
    "what can you do",
    "sen nesin",
    "sen kimsin",
    "ne yapiyorsun",
    "ne yapabiliyorsun"
  ].some(trigger => lower.includes(normalize(trigger)))
}

function shouldOpenPrivateTalk(text) {
  const lower = normalize(text)
  return [
    "i want private talk",
    "private talk",
    "private session",
    "open private session",
    "open private talk",
    "can we talk private",
    "i need private help",
    "ozel konus",
    "ozel konusalim",
    "seninle ozel konusabilir miyim",
    "ozel oda ac",
    "ozel konusma ac",
    "private room"
  ].some(trigger => lower.includes(normalize(trigger)))
}

function asksForGame(text) {
  const lower = normalize(text)
  return [
    "oyun oynayalim",
    "oyun baslat",
    "bir oyun oyna",
    "lets play",
    "let s play",
    "play a game",
    "start a game",
    "mini game",
    "bilmece sor",
    "trivia sor",
    "sayi tahmin"
  ].some(trigger => lower.includes(normalize(trigger)))
}

function chooseGame(text, language) {
  const lower = normalize(text)
  if (lower.includes("bilmece") || lower.includes("riddle")) return "riddle"
  if (lower.includes("trivia")) return "trivia"
  if (lower.includes("sayi") || lower.includes("number")) return "number"
  if (lower.includes("would you rather") || lower.includes("hangisini secerdin")) return "wyr"
  return language === "tr" ? "riddle" : "riddle"
}

function detectLanguageCommand(text) {
  const lower = normalize(text)
  const tight = compact(text)

  const trOn = [
    "turkce konus",
    "turkce devam et",
    "reply in turkish",
    "speak turkish",
    "talk in turkish",
    "sunucuda turkce konus",
    "bu sunucuda turkce konus"
  ]

  const enOn = [
    "ingilizce konus",
    "ingilizce devam et",
    "reply in english",
    "speak english",
    "talk in english",
    "sunucuda ingilizce konus",
    "bu sunucuda ingilizce konus"
  ]

  const auto = [
    "turkce konusmayi birak",
    "ingilizce konusmayi birak",
    "normal konus",
    "otomatik konus",
    "oto dil",
    "auto language",
    "automatic language",
    "return to auto language",
    "dil kilidini kaldir",
    "sunucu dil kilidini kaldir"
  ]

  if (trOn.some(x => lower.includes(normalize(x)) || tight.includes(compact(x)))) return "tr"
  if (enOn.some(x => lower.includes(normalize(x)) || tight.includes(compact(x)))) return "en"
  if (auto.some(x => lower.includes(normalize(x)) || tight.includes(compact(x)))) return "auto"
  return null
}

function isServerLanguageCommand(text) {
  const lower = normalize(text)
  return [
    "sunucuda turkce konus",
    "bu sunucuda turkce konus",
    "server speak turkish",
    "speak turkish in this server",
    "sunucuda ingilizce konus",
    "bu sunucuda ingilizce konus",
    "server speak english",
    "speak english in this server",
    "sunucu dil kilidini kaldir",
    "dil kilidini kaldir"
  ].some(x => lower.includes(normalize(x)))
}

function getGameControlIntent(text) {
  const lower = normalize(text)

  if (["ipucu", "hint", "bir ipucu", "1 harf", "bir harf daha", "1 harf daha", "harf ver"].some(x => lower.includes(normalize(x)))) return "hint"
  if (["bilemedim", "cevap ne", "cevabi soyle", "cevabı söyle", "cevabı söyler misin", "answer", "what was it", "tell me the answer"].some(x => lower.includes(normalize(x)))) return "answer"
  if (["gec", "geç", "pas", "skip", "next"].some(x => lower.includes(normalize(x)))) return "skip"
  if (["oyunu kapat", "oyun bitsin", "oyunu bitir", "dur", "stop game", "stop", "end game"].some(x => lower.includes(normalize(x)))) return "stop"

  return null
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function createGame(channelId, game) {
  activeGames.set(channelId, game)
}

function clearGame(channelId) {
  activeGames.delete(channelId)
}

function getGame(channelId) {
  return activeGames.get(channelId)
}

function getHint(game) {
  const a = String(game.answer)
  if (a.length <= 1) return a
  if (a.length === 2) return `${a[0]}_`
  if (a.length === 3) return `${a[0]}${a[1]}_`
  return `${a.slice(0, 2)}${"_".repeat(a.length - 2)}`
}

function buildStyleInstruction(language, tone, replyStyle) {
  const langPart = language === "tr" ? "Reply in natural Turkish." : "Reply in natural English."

  const toneMap = {
    excited: "Match excitement if naturally present, but do not overact.",
    soft: "Be calmer, gentler and more understanding.",
    casual: "Be natural and casual, but not childish.",
    helpful: "Be practical and focused.",
    neutral: "Stay calm, balanced and natural."
  }

  const sizeMap = {
    very_short: "Keep it very short.",
    short: "Keep it short.",
    medium: "Keep it concise but complete.",
    detailed: "Be more detailed, but stay readable."
  }

  return `${langPart} ${toneMap[tone]} ${sizeMap[replyStyle]} Sound human, warm and confident. Do not ask repetitive follow-up questions.`
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function getBotMember(guild) {
  return guild?.members?.me || null
}

function getChannelPerms(channel) {
  try {
    const me = getBotMember(channel?.guild)
    if (!me || !channel?.permissionsFor) return null
    return channel.permissionsFor(me)
  } catch {
    return null
  }
}

function canViewChannel(channel) {
  const perms = getChannelPerms(channel)
  return Boolean(perms?.has(PermissionFlagsBits.ViewChannel))
}

function canReadHistory(channel) {
  const perms = getChannelPerms(channel)
  return Boolean(perms?.has(PermissionFlagsBits.ReadMessageHistory))
}

function canSendToChannel(channel) {
  if (!channel || typeof channel.send !== "function") return false
  const perms = getChannelPerms(channel)
  if (!perms) return false

  try {
    if (typeof channel.isThread === "function" && channel.isThread()) {
      return (
        perms.has(PermissionFlagsBits.ViewChannel) &&
        perms.has(PermissionFlagsBits.SendMessagesInThreads)
      )
    }
  } catch {}

  return (
    perms.has(PermissionFlagsBits.ViewChannel) &&
    perms.has(PermissionFlagsBits.SendMessages)
  )
}

async function safeTyping(channel) {
  try {
    if (!canSendToChannel(channel)) return false
    if (typeof channel.sendTyping !== "function") return false
    await channel.sendTyping()
    return true
  } catch {
    return false
  }
}

async function safeSend(channel, content) {
  try {
    if (!canSendToChannel(channel)) return null
    return await channel.send({
      content: String(content || ""),
      allowedMentions: { parse: [] }
    })
  } catch (error) {
    console.error("safeSend error:", error?.code, error?.message)
    return null
  }
}

async function safeReply(message, content) {
  if (!message) return null

  try {
    if (message?.channel && canSendToChannel(message.channel) && canReadHistory(message.channel)) {
      return await message.reply({
        content: String(content || ""),
        allowedMentions: { repliedUser: false },
        failIfNotExists: false
      })
    }
  } catch (error) {
    console.error("safeReply primary error:", error?.code, error?.message)
  }

  try {
    if (message?.channel && canSendToChannel(message.channel)) {
      return await message.channel.send({
        content: `${message.author} ${String(content || "")}`,
        allowedMentions: { users: [message.author.id] }
      })
    }
  } catch (error) {
    console.error("safeReply fallback error:", error?.code, error?.message)
  }

  return null
}

function hasAdminAccess(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator)
}

function isOwner(member) {
  return member.guild.ownerId === member.id
}

function botCanManageChannels(guild) {
  const me = guild.members.me
  if (!me) return false
  return me.permissions.has(PermissionFlagsBits.ManageChannels)
}

function botCanManageRoles(guild) {
  const me = guild.members.me
  if (!me) return false
  return me.permissions.has(PermissionFlagsBits.ManageRoles)
}

function getRoleByName(guild, roleName) {
  const target = normalize(roleName).replace(/^@/, "")
  return guild.roles.cache.find(r => normalize(r.name) === target)
}

function findCategoryByName(guild, name) {
  const target = normalize(name)
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && normalize(c.name) === target
  )
}

function findAnyChannelByName(guild, name) {
  const target = normalize(name).replace(/^#/, "")
  return guild.channels.cache.find(
    c => c.type !== ChannelType.GuildCategory && normalize(c.name) === target
  )
}

function findChannelInCategoryByName(guild, categoryName, channelName) {
  const category = findCategoryByName(guild, categoryName)
  if (!category) return null
  const target = normalize(channelName).replace(/^#/, "")

  return guild.channels.cache.find(
    c =>
      c.parentId === category.id &&
      c.type !== ChannelType.GuildCategory &&
      normalize(c.name) === target
  )
}

function toDiscordChannelType(type) {
  const t = normalize(type)
  if (t === "voice" || t === "ses") return ChannelType.GuildVoice
  if (t === "forum") return ChannelType.GuildForum
  return ChannelType.GuildText
}

function buildPermissionOverwrites(guild, permissions, requesterId) {
  const overwrites = []
  const items = Array.isArray(permissions) ? permissions : []

  for (const item of items) {
    const subject = String(item.subject || "").trim().toLowerCase()
    const allowList = Array.isArray(item.allow) ? item.allow : []
    const denyList = Array.isArray(item.deny) ? item.deny : []

    let id = null
    let type = OverwriteType.Role

    if (subject === "everyone" || subject === "@everyone") {
      id = guild.roles.everyone.id
      type = OverwriteType.Role
    } else if (subject === "requester" || subject === "user") {
      id = requesterId
      type = OverwriteType.Member
    } else {
      const role = getRoleByName(guild, subject)
      if (!role) continue
      id = role.id
      type = OverwriteType.Role
    }

    const allow = allowList.map(name => PermissionFlagsBits[name]).filter(Boolean)
    const deny = denyList.map(name => PermissionFlagsBits[name]).filter(Boolean)

    overwrites.push({ id, type, allow, deny })
  }

  return overwrites
}

function uniqueChannelName(guild, parentId, desiredName, type) {
  const base = slugify(desiredName) || "channel"
  let name = base
  let i = 2

  while (
    guild.channels.cache.find(
      c => c.parentId === parentId && c.type === type && c.name === name
    )
  ) {
    name = `${base}-${i}`
    i++
  }

  return name
}

function defaultChannelsForCategory(name, language) {
  const lower = normalize(name)

  if (lower.includes("core") || lower.includes("ana")) {
    return language === "tr"
      ? [
          { name: "genel", type: "text", topic: "Genel sohbet ve ana konuşmalar." },
          { name: "duyurular", type: "text", topic: "Önemli sunucu duyuruları." },
          { name: "kurallar", type: "text", topic: "Sunucu kuralları ve rehberler." },
          { name: "destek", type: "text", topic: "Yardım ve destek talepleri." },
          { name: "lounge", type: "text", topic: "Rahat topluluk sohbeti." },
          { name: "sesli-sohbet", type: "voice" }
        ]
      : [
          { name: "general", type: "text", topic: "Main conversations and community chat." },
          { name: "announcements", type: "text", topic: "Important server announcements." },
          { name: "rules", type: "text", topic: "Server rules and guidance." },
          { name: "support", type: "text", topic: "Help and support requests." },
          { name: "lounge", type: "text", topic: "Casual community chat." },
          { name: "voice-chat", type: "voice" }
        ]
  }

  if (lower.includes("owner") || lower.includes("kurucu")) {
    return language === "tr"
      ? [
          { name: "owner-chat", type: "text", topic: "Kurucu ve yönetim konuşmaları." },
          { name: "owner-notes", type: "text", topic: "Önemli kısa notlar." },
          { name: "owner-voice", type: "voice" }
        ]
      : [
          { name: "owner-chat", type: "text", topic: "Founder and management conversations." },
          { name: "owner-notes", type: "text", topic: "Important quick notes." },
          { name: "owner-voice", type: "voice" }
        ]
  }

  return language === "tr"
    ? [
        { name: "genel", type: "text", topic: `${name} için genel kanal.` },
        { name: "paylasim", type: "text", topic: `${name} için paylaşım alanı.` },
        { name: "sohbet", type: "voice" }
      ]
    : [
        { name: "general", type: "text", topic: `General channel for ${name}.` },
        { name: "sharing", type: "text", topic: `Sharing area for ${name}.` },
        { name: "voice-chat", type: "voice" }
      ]
}

function parseHexColor(text) {
  const match = String(text || "").match(/#([0-9a-fA-F]{6})\b/)
  if (!match) return null
  return `#${match[1].toLowerCase()}`
}

function resolveNamedColor(word) {
  const key = normalize(word)
  return COLOR_ALIASES.tr[key] || COLOR_ALIASES.en[key] || null
}

function extractColorWords(text) {
  const words = splitSmart(text)
  const out = []

  for (const word of words) {
    const hex = resolveNamedColor(word)
    if (hex) out.push({ word, hex })
  }

  const explicitHex = parseHexColor(text)
  if (explicitHex) out.push({ word: explicitHex, hex: explicitHex })

  return out
}

function roleNameFromColorWord(word, language) {
  const w = normalize(word)
  const trMap = {
    mor: "Mor",
    lila: "Lila",
    pembe: "Pembe",
    kirmizi: "Kırmızı",
    kirmızı: "Kırmızı",
    mavi: "Mavi",
    lacivert: "Lacivert",
    turkuaz: "Turkuaz",
    yesil: "Yeşil",
    sari: "Sarı",
    turuncu: "Turuncu",
    beyaz: "Beyaz",
    siyah: "Siyah",
    gri: "Gri"
  }

  const enMap = {
    purple: "Purple",
    violet: "Violet",
    pink: "Pink",
    red: "Red",
    blue: "Blue",
    navy: "Navy",
    cyan: "Cyan",
    green: "Green",
    yellow: "Yellow",
    orange: "Orange",
    white: "White",
    black: "Black",
    gray: "Gray",
    grey: "Grey"
  }

  if (trMap[w]) return trMap[w]
  if (enMap[w]) return enMap[w]
  if (/^#[0-9a-f]{6}$/i.test(word)) return word.toUpperCase()
  return language === "tr" ? titleCaseRoleName(word) : titleCaseRoleName(word)
}

function extractQuoted(text) {
  const matches = [...String(text || "").matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)]
  return matches
    .map(m => m[1] || m[2] || m[3] || "")
    .map(v => v.trim())
    .filter(Boolean)
}

function parseCount(text) {
  const n = normalize(text)
  const digit = n.match(/\b(\d{1,2})\b/)
  if (digit) return Math.max(1, Math.min(20, Number(digit[1])))

  const wordMap = {
    bir: 1, iki: 2, uc: 3, üç: 3, dort: 4, dört: 4, bes: 5, beş: 5,
    alti: 6, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10
  }

  for (const [k, v] of Object.entries(wordMap)) {
    if (n.includes(` ${normalize(k)} `) || n.startsWith(`${normalize(k)} `) || n.endsWith(` ${normalize(k)}`) || n === normalize(k)) {
      return v
    }
  }

  return null
}

function looksLikeManagementRequest(text) {
  const lower = normalize(text)

  const hints = [
    "kategori", "category",
    "kanal", "channel",
    "olustur", "create",
    "sil", "delete",
    "degistir", "rename",
    "tası", "taşı", "move",
    "aciklama", "açıklama", "topic", "description",
    "rol", "role",
    "ver", "give",
    "renk", "color"
  ]

  return hints.some(h => lower.includes(normalize(h)))
}

function buildEmptyManagementPlan() {
  return {
    isManagementRequest: false,
    operations: []
  }
}

function parseRoleIntentManual(text, language) {
  const lower = normalize(text)
  const operations = []

  const hasRoleWord = lower.includes("rol") || lower.includes("role")
  if (!hasRoleWord) return operations

  const colors = extractColorWords(text)
  const quoted = extractQuoted(text)

  const wantsGiveMe =
    lower.includes("bana") ||
    lower.includes("give me") ||
    lower.includes("assign me") ||
    lower.includes("ver") ||
    lower.includes("ekle")

  const wantsCreate =
    lower.includes("olustur") ||
    lower.includes("create") ||
    lower.includes("ac") ||
    lower.includes("make")

  if (colors.length && wantsGiveMe) {
    for (const item of uniqueArray(colors.map(c => JSON.stringify(c))).map(v => JSON.parse(v))) {
      const roleName = roleNameFromColorWord(item.word, language)
      operations.push({
        type: "create_role",
        roleName,
        color: item.hex,
        assignToRequester: true
      })
    }
    return operations
  }

  if (colors.length && wantsCreate) {
    for (const item of uniqueArray(colors.map(c => JSON.stringify(c))).map(v => JSON.parse(v))) {
      const roleName = roleNameFromColorWord(item.word, language)
      operations.push({
        type: "create_role",
        roleName,
        color: item.hex,
        assignToRequester: false
      })
    }
    return operations
  }

  if (quoted.length && wantsGiveMe) {
    for (const q of quoted) {
      operations.push({
        type: "create_role",
        roleName: titleCaseRoleName(q),
        color: parseHexColor(text),
        assignToRequester: true
      })
    }
    return operations
  }

  if (quoted.length && wantsCreate) {
    for (const q of quoted) {
      operations.push({
        type: "create_role",
        roleName: titleCaseRoleName(q),
        color: parseHexColor(text),
        assignToRequester: false
      })
    }
    return operations
  }

  const singularTR = lower.match(/bana\s+([a-z0-9ğüşöçı# -]+?)\s+renkte\s+bir\s+rol\s+ver/)
  if (singularTR?.[1]) {
    const raw = singularTR[1].trim()
    const color = resolveNamedColor(raw) || parseHexColor(raw)
    operations.push({
      type: "create_role",
      roleName: roleNameFromColorWord(raw, language),
      color,
      assignToRequester: true
    })
    return operations
  }

  const singularEN = lower.match(/give me a\s+([a-z0-9# -]+?)\s+role/)
  if (singularEN?.[1]) {
    const raw = singularEN[1].trim()
    const color = resolveNamedColor(raw) || parseHexColor(raw)
    operations.push({
      type: "create_role",
      roleName: roleNameFromColorWord(raw, language),
      color,
      assignToRequester: true
    })
    return operations
  }

  return operations
}

function manualIntentParser(text, language) {
  const lower = normalize(text)
  const operations = []

  const roleOps = parseRoleIntentManual(text, language)
  if (roleOps.length) {
    return { isManagementRequest: true, operations: roleOps }
  }

  const categoryPairMatch =
    lower.match(/([a-z0-9ğüşöçı -]+?)\s+adinda\s+kategori\s+olustur/) ||
    lower.match(/create\s+(?:a\s+)?category\s+(?:named\s+)?([a-z0-9 -]+)/)

  const channelCount = parseCount(text)
  const allTopicTR =
    lower.match(/hepsinin\s+aciklamasi\s+(.+?)\s+olsun/) ||
    lower.match(/hepsinin\s+açıklaması\s+(.+?)\s+olsun/)
  const allTopicEN =
    lower.match(/all(?: of them)?(?: channels)?(?: should)?(?: have)?(?: the)? description\s+(.+)/) ||
    lower.match(/with(?: the)? description\s+(.+)/)

  const categoryOnlyName =
    lower.match(/([a-z0-9ğüşöçı -]+?)\s+adinda\s+kategori/) ||
    lower.match(/([a-z0-9ğüşöçı -]+?)\s+isminde\s+kategori/) ||
    lower.match(/category\s+([a-z0-9 -]+)/)

  if (categoryPairMatch?.[1] || categoryOnlyName?.[1]) {
    const rawCategory = (categoryPairMatch?.[1] || categoryOnlyName?.[1] || "").trim()
    const categoryName = rawCategory.replace(/\s+(ve|and)\s*$/i, "").trim()

    operations.push({
      type: "create_category",
      categoryName,
      newCategoryName: null,
      channelName: null,
      newChannelName: null,
      channelType: null,
      topic: null,
      targetCategoryName: null,
      baseName: null,
      applySensibleDefaults:
        lower.includes("mantikli") ||
        lower.includes("uygun") ||
        lower.includes("sensible") ||
        lower.includes("smart"),
      permissions: []
    })

    const wantsChannelsInside =
      lower.includes("kanallari olsun") ||
      lower.includes("kanalları olsun") ||
      lower.includes("kanallar olsun") ||
      lower.includes("channels in it") ||
      lower.includes("inside it") ||
      lower.includes("under it") ||
      lower.includes("create channels") ||
      lower.includes("4 tane") ||
      lower.includes("4 channel") ||
      lower.includes("4 channels")

    if (wantsChannelsInside && channelCount) {
      for (let i = 1; i <= channelCount; i++) {
        operations.push({
          type: "create_channel",
          categoryName,
          newCategoryName: null,
          channelName: i === 1 ? "general" : `channel-${i}`,
          newChannelName: null,
          channelType: "text",
          topic: null,
          targetCategoryName: null,
          baseName: null,
          applySensibleDefaults: false,
          permissions: []
        })
      }

      const topic = (allTopicTR?.[1] || allTopicEN?.[1] || "").trim()
      if (topic) {
        operations.push({
          type: "set_all_channel_topics_in_category",
          categoryName,
          newCategoryName: null,
          channelName: null,
          newChannelName: null,
          channelType: null,
          topic,
          targetCategoryName: null,
          baseName: null,
          applySensibleDefaults: false,
          permissions: []
        })
      }

      return {
        isManagementRequest: true,
        operations
      }
    }
  }

  const createCategoryTriggers = [
    "kategori olustur",
    "kategori ac",
    "category create",
    "create category"
  ]

  const deleteCategoryTriggers = [
    "kategori sil",
    "category delete",
    "delete category"
  ]

  const createChannelTriggers = [
    "kanal olustur",
    "kanal ac",
    "create channel",
    "open channel"
  ]

  const deleteChannelTriggers = [
    "kanal sil",
    "delete channel"
  ]

  if (
    lower.includes("mantikli kanallar") ||
    lower.includes("sensible channels") ||
    lower.includes("uygun kanallar") ||
    lower.includes("mantikli olanlari ac")
  ) {
    const m = lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+adinda\s+kategori/)
    if (m?.[1]) {
      operations.push({
        type: "create_category",
        categoryName: m[1].trim(),
        newCategoryName: null,
        channelName: null,
        newChannelName: null,
        channelType: null,
        topic: null,
        targetCategoryName: null,
        baseName: null,
        applySensibleDefaults: true,
        permissions: []
      })
    }
  }

  if (lower.includes("tum kanallarin ismini") || lower.includes("all channel names")) {
    const namedCat = lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kategorisindeki\s+tum\s+kanallar/)
    const nameMatch = lower.match(/ismini\s+([a-z0-9ğüşöçı\s-]+)\s+yap/) || lower.match(/name(?:s)?\s+to\s+([a-z0-9\s-]+)/)
    if (namedCat?.[1] && nameMatch?.[1]) {
      operations.push({
        type: "rename_all_channels_in_category",
        categoryName: namedCat[1].trim(),
        newCategoryName: null,
        channelName: null,
        newChannelName: null,
        channelType: null,
        topic: null,
        targetCategoryName: null,
        baseName: nameMatch[1].trim(),
        applySensibleDefaults: false,
        permissions: []
      })
    }
  }

  if (
    lower.includes("aciklamasini degistir") ||
    lower.includes("açıklamasını değiştir") ||
    lower.includes("description change") ||
    lower.includes("change topic")
  ) {
    const catMatch = lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kategorisindeki/)
    const topicMatch =
      lower.match(/aciklamasini\s+(.+?)\s+yap/) ||
      lower.match(/açıklamasını\s+(.+?)\s+yap/) ||
      lower.match(/topic to\s+(.+)/)

    if (catMatch?.[1] && topicMatch?.[1]) {
      operations.push({
        type: "set_all_channel_topics_in_category",
        categoryName: catMatch[1].trim(),
        newCategoryName: null,
        channelName: null,
        newChannelName: null,
        channelType: null,
        topic: topicMatch[1].trim(),
        targetCategoryName: null,
        baseName: null,
        applySensibleDefaults: false,
        permissions: []
      })
    }
  }

  for (const trigger of createCategoryTriggers) {
    if (lower.includes(normalize(trigger))) {
      const m =
        lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+adinda\s+kategori/) ||
        lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+isminde\s+kategori/) ||
        lower.match(/kategori\s+([a-z0-9ğüşöçı\s-]+)/) ||
        lower.match(/category\s+([a-z0-9\s-]+)/)

      if (m?.[1]) {
        const categoryName = m[1].trim()
        operations.push({
          type: "create_category",
          categoryName,
          newCategoryName: null,
          channelName: null,
          newChannelName: null,
          channelType: null,
          topic: null,
          targetCategoryName: null,
          baseName: null,
          applySensibleDefaults: lower.includes("mantikli") || lower.includes("uygun") || lower.includes("sensible"),
          permissions: []
        })
      }
      break
    }
  }

  for (const trigger of deleteCategoryTriggers) {
    if (lower.includes(normalize(trigger))) {
      const m =
        lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kategorisini\s+sil/) ||
        lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kategoriyi\s+sil/) ||
        lower.match(/delete category\s+([a-z0-9\s-]+)/)

      if (m?.[1]) {
        operations.push({
          type: "delete_category",
          categoryName: m[1].trim(),
          newCategoryName: null,
          channelName: null,
          newChannelName: null,
          channelType: null,
          topic: null,
          targetCategoryName: null,
          baseName: null,
          applySensibleDefaults: false,
          permissions: []
        })
      }
      break
    }
  }

  for (const trigger of createChannelTriggers) {
    if (lower.includes(normalize(trigger))) {
      const catMatch =
        lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kategorisine/) ||
        lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kategorisinde/) ||
        lower.match(/under category\s+([a-z0-9\s-]+)/)

      const quoted = extractQuoted(text)
      const count = parseCount(text)
      const wantsVoice = lower.includes("ses") || lower.includes("voice")
      const topicMatch =
        lower.match(/aciklamasi\s+(.+?)\s+olsun/) ||
        lower.match(/açıklaması\s+(.+?)\s+olsun/) ||
        lower.match(/with(?: the)? topic\s+(.+)/)

      if (quoted.length) {
        for (const q of quoted) {
          operations.push({
            type: "create_channel",
            categoryName: catMatch?.[1]?.trim() || null,
            newCategoryName: null,
            channelName: q,
            newChannelName: null,
            channelType: wantsVoice ? "voice" : "text",
            topic: topicMatch?.[1]?.trim() || null,
            targetCategoryName: null,
            baseName: null,
            applySensibleDefaults: false,
            permissions: []
          })
        }
      } else if (count && catMatch?.[1]) {
        for (let i = 1; i <= count; i++) {
          operations.push({
            type: "create_channel",
            categoryName: catMatch[1].trim(),
            newCategoryName: null,
            channelName: i === 1 ? "general" : `channel-${i}`,
            newChannelName: null,
            channelType: wantsVoice ? "voice" : "text",
            topic: null,
            targetCategoryName: null,
            baseName: null,
            applySensibleDefaults: false,
            permissions: []
          })
        }

        if (topicMatch?.[1]) {
          operations.push({
            type: "set_all_channel_topics_in_category",
            categoryName: catMatch[1].trim(),
            newCategoryName: null,
            channelName: null,
            newChannelName: null,
            channelType: null,
            topic: topicMatch[1].trim(),
            targetCategoryName: null,
            baseName: null,
            applySensibleDefaults: false,
            permissions: []
          })
        }
      } else {
        const channelMatches = []
        const regex = /([a-z0-9ğüşöçı\s-]+?)\s+kanal(?:i|ı|ini|ını)?/g
        let found
        while ((found = regex.exec(lower)) !== null) {
          const val = found[1].trim()
          if (
            val &&
            !val.includes("kategori") &&
            !val.includes("yeni") &&
            !val.includes("tum") &&
            !val.includes("tüm")
          ) {
            channelMatches.push(val)
          }
        }

        for (const chName of uniqueArray(channelMatches)) {
          operations.push({
            type: "create_channel",
            categoryName: catMatch?.[1]?.trim() || null,
            newCategoryName: null,
            channelName: chName,
            newChannelName: null,
            channelType: wantsVoice ? "voice" : "text",
            topic: topicMatch?.[1]?.trim() || null,
            targetCategoryName: null,
            baseName: null,
            applySensibleDefaults: false,
            permissions: []
          })
        }
      }

      break
    }
  }

  for (const trigger of deleteChannelTriggers) {
    if (lower.includes(normalize(trigger))) {
      const m =
        lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kanalini\s+sil/) ||
        lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kanalını\s+sil/) ||
        lower.match(/delete channel\s+([a-z0-9\s-]+)/)

      if (m?.[1]) {
        operations.push({
          type: "delete_channel",
          categoryName: null,
          newCategoryName: null,
          channelName: m[1].trim(),
          newChannelName: null,
          channelType: null,
          topic: null,
          targetCategoryName: null,
          baseName: null,
          applySensibleDefaults: false,
          permissions: []
        })
      }
      break
    }
  }

  if (lower.includes("kanal adini degistir") || lower.includes("kanal adını değiştir") || lower.includes("rename channel")) {
    const m =
      lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kanal(?:inin|in|ıni|ini)?\s+adini\s+([a-z0-9ğüşöçı\s-]+)\s+yap/) ||
      lower.match(/rename channel\s+([a-z0-9\s-]+)\s+to\s+([a-z0-9\s-]+)/)
    if (m?.[1] && m?.[2]) {
      operations.push({
        type: "rename_channel",
        categoryName: null,
        newCategoryName: null,
        channelName: m[1].trim(),
        newChannelName: m[2].trim(),
        channelType: null,
        topic: null,
        targetCategoryName: null,
        baseName: null,
        applySensibleDefaults: false,
        permissions: []
      })
    }
  }

  if (lower.includes("kategori adini degistir") || lower.includes("kategori adını değiştir") || lower.includes("rename category")) {
    const m =
      lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kategorisinin\s+adini\s+([a-z0-9ğüşöçı\s-]+)\s+yap/) ||
      lower.match(/rename category\s+([a-z0-9\s-]+)\s+to\s+([a-z0-9\s-]+)/)
    if (m?.[1] && m?.[2]) {
      operations.push({
        type: "rename_category",
        categoryName: m[1].trim(),
        newCategoryName: m[2].trim(),
        channelName: null,
        newChannelName: null,
        channelType: null,
        topic: null,
        targetCategoryName: null,
        baseName: null,
        applySensibleDefaults: false,
        permissions: []
      })
    }
  }

  if (lower.includes("kanal aciklamasini degistir") || lower.includes("kanal açıklamasını değiştir") || lower.includes("change channel topic")) {
    const m =
      lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kanal(?:inin|in|ıni|ini)?\s+aciklamasini\s+(.+?)\s+yap/) ||
      lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kanal(?:inin|in|ıni|ini)?\s+açıklamasını\s+(.+?)\s+yap/) ||
      lower.match(/change channel topic\s+([a-z0-9\s-]+)\s+to\s+(.+)/)
    if (m?.[1] && m?.[2]) {
      operations.push({
        type: "set_channel_topic",
        categoryName: null,
        newCategoryName: null,
        channelName: m[1].trim(),
        newChannelName: null,
        channelType: null,
        topic: m[2].trim(),
        targetCategoryName: null,
        baseName: null,
        applySensibleDefaults: false,
        permissions: []
      })
    }
  }

  if (lower.includes("kanali tasi") || lower.includes("kanalı taşı") || lower.includes("move channel")) {
    const m =
      lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kanal(?:ini|ını)?\s+([a-z0-9ğüşöçı\s-]+?)\s+kategorisine\s+tasi/) ||
      lower.match(/([a-z0-9ğüşöçı\s-]+?)\s+kanal(?:ini|ını)?\s+([a-z0-9ğüşöçı\s-]+?)\s+kategorisine\s+taşı/) ||
      lower.match(/move channel\s+([a-z0-9\s-]+)\s+to\s+([a-z0-9\s-]+)/)
    if (m?.[1] && m?.[2]) {
      operations.push({
        type: "move_channel",
        categoryName: null,
        newCategoryName: null,
        channelName: m[1].trim(),
        newChannelName: null,
        channelType: null,
        topic: null,
        targetCategoryName: m[2].trim(),
        baseName: null,
        applySensibleDefaults: false,
        permissions: []
      })
    }
  }

  if (
    lower.includes("tum kategori ve kanallari sil") ||
    lower.includes("tüm kategori ve kanalları sil") ||
    lower.includes("delete all categories and channels")
  ) {
    operations.push({
      type: "delete_all_structure",
      categoryName: null,
      newCategoryName: null,
      channelName: null,
      newChannelName: null,
      channelType: null,
      topic: null,
      targetCategoryName: null,
      baseName: null,
      applySensibleDefaults: false,
      permissions: []
    })
  }

  if (!operations.length) {
    return buildEmptyManagementPlan()
  }

  return {
    isManagementRequest: true,
    operations
  }
}

async function aiIntentParser(question, language) {
  const schema = {
    name: "disogle_management_plan",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        isManagementRequest: { type: "boolean" },
        operations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: {
                type: "string",
                enum: [
                  "create_category",
                  "delete_category",
                  "rename_category",
                  "create_channel",
                  "delete_channel",
                  "rename_channel",
                  "set_channel_topic",
                  "move_channel",
                  "rename_all_channels_in_category",
                  "set_all_channel_topics_in_category",
                  "delete_all_structure",
                  "create_role"
                ]
              },
              categoryName: { type: ["string", "null"] },
              newCategoryName: { type: ["string", "null"] },
              channelName: { type: ["string", "null"] },
              newChannelName: { type: ["string", "null"] },
              channelType: {
                type: ["string", "null"],
                enum: ["text", "voice", "forum", null]
              },
              topic: { type: ["string", "null"] },
              targetCategoryName: { type: ["string", "null"] },
              baseName: { type: ["string", "null"] },
              applySensibleDefaults: { type: "boolean" },
              roleName: { type: ["string", "null"] },
              color: { type: ["string", "null"] },
              assignToRequester: { type: "boolean" },
              permissions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    subject: { type: "string" },
                    allow: { type: "array", items: { type: "string" } },
                    deny: { type: "array", items: { type: "string" } }
                  },
                  required: ["subject", "allow", "deny"]
                }
              }
            },
            required: [
              "type",
              "categoryName",
              "newCategoryName",
              "channelName",
              "newChannelName",
              "channelType",
              "topic",
              "targetCategoryName",
              "baseName",
              "applySensibleDefaults",
              "roleName",
              "color",
              "assignToRequester",
              "permissions"
            ]
          }
        }
      },
      required: ["isManagementRequest", "operations"]
    }
  }

  const prompt = [
    "You are a Discord server intent parser.",
    "Return only JSON matching the schema.",
    "Understand Turkish and English extremely well.",
    "If the user asks for categories, channels, descriptions/topics, moving channels, deleting structure, roles, or colored roles, classify it as management.",
    "For messages like 'create category x and make 4 channels inside it and give all of them description y', produce multiple operations in order.",
    "For messages like 'give me a purple role' or 'bana mor renkte rol ver', use create_role with assignToRequester true.",
    "For messages like 'create purple pink red roles', create multiple create_role operations.",
    "If the user is just chatting, return isManagementRequest false and operations empty."
  ].join(" ")

  const response = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: prompt }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: `Language: ${language}\nUser message: ${question}` }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: schema.name,
        schema: schema.schema
      }
    }
  })

  const content =
    response.output_text ||
    response.output?.[0]?.content?.[0]?.text ||
    ""

  const parsed = safeJsonParse(content)

  if (!parsed || !Array.isArray(parsed.operations)) {
    return buildEmptyManagementPlan()
  }

  return parsed
}

async function detectManagementPlan(question, language) {
  const manual = manualIntentParser(question, language)
  if (manual.isManagementRequest) return manual

  if (!looksLikeManagementRequest(question)) {
    return buildEmptyManagementPlan()
  }

  try {
    const ai = await aiIntentParser(question, language)
    if (ai.isManagementRequest) return ai
  } catch (error) {
    console.error("aiIntentParser error:", error?.message || error)
  }

  return buildEmptyManagementPlan()
}

async function createPrivateChannel(message, language) {
  const guild = message.guild
  const member = message.member

  if (!botCanManageChannels(guild)) {
    await safeReply(
      message,
      language === "tr"
        ? "Özel oda açabilmem için Manage Channels yetkisine ihtiyacım var."
        : "I need Manage Channels permission to open a private room."
    )
    return
  }

  const safeName = slugify(member.user.username).slice(0, 20) || "user"
  const channelName = `private-${safeName}`

  const existing = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildText &&
      channel.name === channelName
  )

  if (existing) {
    await safeReply(
      message,
      language === "tr"
        ? `Zaten açık bir özel odan var: ${existing}`
        : `You already have an active private room: ${existing}`
    )
    return
  }

  try {
    const privateChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: member.id,
          type: OverwriteType.Member,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: client.user.id,
          type: OverwriteType.Member,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ]
    })

    await safeSend(
      privateChannel,
      language === "tr"
        ? `Merhaba ${member}, özel konuşma odan hazır. Hazırsan yaz, ben buradayım.`
        : `Hey ${member}, your private room is ready. Send a message whenever you're ready.`
    )

    await safeReply(
      message,
      language === "tr"
        ? `Özel odan hazır: ${privateChannel}`
        : `Your private room is ready: ${privateChannel}`
    )
  } catch (error) {
    console.error("createPrivateChannel error:", error)
    await safeReply(
      message,
      language === "tr"
        ? "Özel oda açarken bir izin ya da yapılandırma hatası oluştu."
        : "A permission or setup error happened while creating the private room."
    )
  }
}

async function startGame(message, language, gameType) {
  if (gameType === "riddle") {
    const riddle = randomItem(riddles)
    createGame(message.channel.id, {
      type: "riddle",
      language,
      answer: language === "tr" ? riddle.answerTR : riddle.answerEN
    })

    await safeReply(
      message,
      language === "tr"
        ? `Bilmece zamanı:\n${riddle.questionTR}\n\nİstersen ipucu isteyebilir, geçebilir ya da cevabı sorabilirsin.`
        : `Riddle time:\n${riddle.questionEN}\n\nYou can ask for a hint, skip, or ask for the answer.`
    )
    return
  }

  if (gameType === "trivia") {
    const trivia = language === "tr" ? randomItem(triviaTR) : randomItem(triviaEN)
    createGame(message.channel.id, {
      type: "trivia",
      language,
      answer: trivia.a
    })

    await safeReply(
      message,
      language === "tr"
        ? `Soru:\n${trivia.q}\n\nİstersen ipucu isteyebilir, geçebilir ya da cevabı sorabilirsin.`
        : `Trivia:\n${trivia.q}\n\nYou can ask for a hint, skip, or ask for the answer.`
    )
    return
  }

  if (gameType === "number") {
    const target = String(Math.floor(Math.random() * 10) + 1)
    createGame(message.channel.id, {
      type: "number",
      language,
      answer: target
    })

    await safeReply(
      message,
      language === "tr"
        ? "1 ile 10 arasında bir sayı tuttum. Tahmin et. İstersen geçebilir ya da cevabı sorabilirsin."
        : "I picked a number between 1 and 10. Guess it. You can skip or ask for the answer."
    )
    return
  }

  if (gameType === "wyr") {
    const q = language === "tr" ? randomItem(wouldYouRatherTR) : randomItem(wouldYouRatherEN)
    await safeReply(message, q)
  }
}

async function handleGameMessage(message, game) {
  const language = game.language
  const content = message.content

  if (shouldOpenPrivateTalk(content)) {
    clearGame(message.channel.id)
    return "handoff_private"
  }

  if (asksAboutFounder(content)) {
    clearGame(message.channel.id)
    return "handoff_founder"
  }

  if (asksWhatAreYou(content)) {
    clearGame(message.channel.id)
    return "handoff_identity"
  }

  if (asksForGame(content)) {
    clearGame(message.channel.id)
    return "handoff_new_game"
  }

  const langCmd = detectLanguageCommand(content)
  if (langCmd) {
    clearGame(message.channel.id)
    return "handoff_language"
  }

  const control = getGameControlIntent(content)

  if (control === "hint") {
    await safeReply(message, language === "tr" ? `İpucu: ${getHint(game)}` : `Hint: ${getHint(game)}`)
    return "handled"
  }

  if (control === "answer") {
    clearGame(message.channel.id)
    await safeReply(
      message,
      language === "tr"
        ? `Cevap: ${game.answer}. İstersen yeni bir oyun başlatabiliriz.`
        : `The answer was: ${game.answer}. We can start a new game if you want.`
    )
    return "handled"
  }

  if (control === "skip") {
    clearGame(message.channel.id)
    await safeReply(
      message,
      language === "tr"
        ? "Tamam, bunu geçiyorum. İstersen yeni bir oyun başlatabiliriz."
        : "Alright, skipping this one. We can start a new game if you want."
    )
    return "handled"
  }

  if (control === "stop") {
    clearGame(message.channel.id)
    await safeReply(message, language === "tr" ? "Tamam, oyunu kapattım." : "Alright, I ended the game.")
    return "handled"
  }

  const answer = normalize(content)
  if (answer === normalize(game.answer)) {
    clearGame(message.channel.id)
    await safeReply(message, language === "tr" ? "Doğru bildin. Güzel oynadın." : "Correct. Nice one.")
    return "handled"
  }

  if (game.type === "number" && /^\d+$/.test(answer)) {
    await safeReply(
      message,
      language === "tr"
        ? "Olmadı. Bir daha dene, ya da geç diyebilirsin."
        : "Not that one. Try again, or say skip."
    )
    return "handled"
  }

  if ((game.type === "trivia" || game.type === "riddle") && answer.length > 0) {
    await safeReply(
      message,
      language === "tr"
        ? "Henüz doğru değil. İstersen ipucu al, geç ya da cevabı sor."
        : "Not correct yet. You can ask for a hint, skip, or ask for the answer."
    )
    return "handled"
  }

  return "handled"
}

function canBotAssignRole(guild, role) {
  const me = guild.members.me
  if (!me || !role) return false
  return me.roles.highest.position > role.position
}

function normalizeHexToInt(hex) {
  if (!hex) return undefined
  const clean = String(hex).replace("#", "")
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return undefined
  return parseInt(clean, 16)
}

async function ensureRole(guild, roleName, colorHex) {
  const existing = getRoleByName(guild, roleName)
  if (existing) return { role: existing, created: false }

  const role = await guild.roles.create({
    name: titleCaseRoleName(roleName),
    color: normalizeHexToInt(colorHex)
  })

  return { role, created: true }
}

async function executeManagementPlan(message, plan, language) {
  const guild = message.guild
  const member = message.member

  const needsChannelPower = plan.operations.some(op =>
    [
      "create_category",
      "delete_category",
      "rename_category",
      "create_channel",
      "delete_channel",
      "rename_channel",
      "set_channel_topic",
      "move_channel",
      "rename_all_channels_in_category",
      "set_all_channel_topics_in_category",
      "delete_all_structure"
    ].includes(op.type)
  )

  const needsRolePower = plan.operations.some(op => op.type === "create_role")

  if (needsChannelPower && !hasAdminAccess(member)) {
    await safeReply(
      message,
      language === "tr"
        ? "Kanal ve kategori yönetimi için kullanıcının yönetici yetkisi olmalı."
        : "Channel and category management requires administrator permission."
    )
    return true
  }

  if (needsRolePower && !hasAdminAccess(member)) {
    await safeReply(
      message,
      language === "tr"
        ? "Rol oluşturma ve rol verme işlemleri için yönetici yetkisi gerekli."
        : "Creating and assigning roles requires administrator permission."
    )
    return true
  }

  if (needsChannelPower && !botCanManageChannels(guild)) {
    await safeReply(
      message,
      language === "tr"
        ? "Bunu yapabilmem için bende Manage Channels yetkisi olmalı."
        : "I need Manage Channels permission to do that."
    )
    return true
  }

  if (needsRolePower && !botCanManageRoles(guild)) {
    await safeReply(
      message,
      language === "tr"
        ? "Rol işlemleri için bende Manage Roles yetkisi olmalı."
        : "I need Manage Roles permission for role actions."
    )
    return true
  }

  const results = []

  for (const op of plan.operations) {
    try {
      if (op.type === "create_role") {
        const roleName = titleCaseRoleName(op.roleName || (language === "tr" ? "Yeni Rol" : "New Role"))
        const colorHex = op.color || undefined
        const { role, created } = await ensureRole(guild, roleName, colorHex)

        if (colorHex && role.color !== normalizeHexToInt(colorHex) && canBotAssignRole(guild, role)) {
          try {
            await role.setColor(normalizeHexToInt(colorHex))
          } catch {}
        }

        if (op.assignToRequester) {
          if (!canBotAssignRole(guild, role)) {
            results.push(
              language === "tr"
                ? `Rol oluşturuldu ama bana göre daha yüksek kaldığı için veremedim: ${role.name}`
                : `Role was created but I could not assign it because of role hierarchy: ${role.name}`
            )
          } else {
            await member.roles.add(role)
            results.push(
              language === "tr"
                ? `${created ? "Rol oluşturuldu ve verildi" : "Rol verildi"}: ${role.name}`
                : `${created ? "Created and assigned role" : "Assigned role"}: ${role.name}`
            )
          }
        } else {
          results.push(
            language === "tr"
              ? `${created ? "Rol oluşturuldu" : "Rol zaten vardı"}: ${role.name}`
              : `${created ? "Created role" : "Role already existed"}: ${role.name}`
          )
        }
      }

      if (op.type === "create_category") {
        const rawName = op.categoryName || (language === "tr" ? "Yeni Kategori" : "New Category")
        let category = findCategoryByName(guild, rawName)

        if (!category) {
          const permissionOverwrites = buildPermissionOverwrites(guild, op.permissions, member.id)
          category = await guild.channels.create({
            name: slugify(rawName),
            type: ChannelType.GuildCategory,
            permissionOverwrites: permissionOverwrites.length ? permissionOverwrites : undefined
          })
          results.push(language === "tr" ? `Kategori oluşturuldu: ${category.name}` : `Created category: ${category.name}`)
        } else {
          results.push(language === "tr" ? `Kategori zaten vardı: ${category.name}` : `Category already existed: ${category.name}`)
        }

        if (op.applySensibleDefaults) {
          const defaults = defaultChannelsForCategory(rawName, language)
          for (const ch of defaults) {
            const type = toDiscordChannelType(ch.type)
            const uniqueName = uniqueChannelName(guild, category.id, ch.name, type)
            const permissionOverwrites = buildPermissionOverwrites(guild, op.permissions, member.id)

            const createdChannel = await guild.channels.create({
              name: uniqueName,
              type,
              parent: category.id,
              topic: type === ChannelType.GuildText ? ch.topic || undefined : undefined,
              permissionOverwrites: permissionOverwrites.length ? permissionOverwrites : undefined
            })

            results.push(language === "tr" ? `Kanal oluşturuldu: ${createdChannel.name}` : `Created channel: ${createdChannel.name}`)
          }
        }
      }

      if (op.type === "delete_category") {
        const category = findCategoryByName(guild, op.categoryName)
        if (!category) {
          results.push(language === "tr" ? `Kategori bulunamadı: ${op.categoryName}` : `Category not found: ${op.categoryName}`)
        } else {
          const children = guild.channels.cache.filter(c => c.parentId === category.id)
          for (const [, child] of children) {
            await child.delete()
          }
          const deletedName = category.name
          await category.delete()
          results.push(language === "tr" ? `Kategori silindi: ${deletedName}` : `Deleted category: ${deletedName}`)
        }
      }

      if (op.type === "rename_category") {
        const category = findCategoryByName(guild, op.categoryName)
        if (!category) {
          results.push(language === "tr" ? `Kategori bulunamadı: ${op.categoryName}` : `Category not found: ${op.categoryName}`)
        } else {
          const newName = slugify(op.newCategoryName || "kategori")
          await category.setName(newName)
          results.push(language === "tr" ? `Kategori adı değiştirildi: ${newName}` : `Renamed category to: ${newName}`)
        }
      }

      if (op.type === "create_channel") {
        let category = null

        if (op.categoryName) {
          category = findCategoryByName(guild, op.categoryName)
          if (!category) {
            category = await guild.channels.create({
              name: slugify(op.categoryName),
              type: ChannelType.GuildCategory
            })
            results.push(language === "tr" ? `Kategori oluşturuldu: ${category.name}` : `Created category: ${category.name}`)
          }
        }

        const type = toDiscordChannelType(op.channelType || "text")
        const rawName = op.channelName || (language === "tr" ? "kanal" : "channel")
        const name = uniqueChannelName(guild, category?.id || null, rawName, type)
        const permissionOverwrites = buildPermissionOverwrites(guild, op.permissions, member.id)

        const created = await guild.channels.create({
          name,
          type,
          parent: category?.id || undefined,
          topic: type === ChannelType.GuildText ? op.topic || undefined : undefined,
          permissionOverwrites: permissionOverwrites.length ? permissionOverwrites : undefined
        })

        results.push(language === "tr" ? `Kanal oluşturuldu: ${created.name}` : `Created channel: ${created.name}`)
      }

      if (op.type === "delete_channel") {
        let channel = null

        if (op.categoryName && op.channelName) {
          channel = findChannelInCategoryByName(guild, op.categoryName, op.channelName)
        } else if (op.channelName) {
          channel = findAnyChannelByName(guild, op.channelName)
        }

        if (!channel) {
          results.push(language === "tr" ? `Kanal bulunamadı: ${op.channelName}` : `Channel not found: ${op.channelName}`)
        } else {
          const deletedName = channel.name
          await channel.delete()
          results.push(language === "tr" ? `Kanal silindi: ${deletedName}` : `Deleted channel: ${deletedName}`)
        }
      }

      if (op.type === "rename_channel") {
        let channel = null

        if (op.categoryName && op.channelName) {
          channel = findChannelInCategoryByName(guild, op.categoryName, op.channelName)
        } else if (op.channelName) {
          channel = findAnyChannelByName(guild, op.channelName)
        }

        if (!channel) {
          results.push(language === "tr" ? `Kanal bulunamadı: ${op.channelName}` : `Channel not found: ${op.channelName}`)
        } else {
          const newName = uniqueChannelName(guild, channel.parentId, op.newChannelName || "kanal", channel.type)
          await channel.setName(newName)
          results.push(language === "tr" ? `Kanal adı değiştirildi: ${newName}` : `Renamed channel to: ${newName}`)
        }
      }

      if (op.type === "set_channel_topic") {
        let channel = null

        if (op.categoryName && op.channelName) {
          channel = findChannelInCategoryByName(guild, op.categoryName, op.channelName)
        } else if (op.channelName) {
          channel = findAnyChannelByName(guild, op.channelName)
        }

        if (!channel) {
          results.push(language === "tr" ? `Kanal bulunamadı: ${op.channelName}` : `Channel not found: ${op.channelName}`)
        } else if (channel.type !== ChannelType.GuildText) {
          results.push(language === "tr" ? `Açıklama sadece yazı kanallarında değiştirilebilir: ${channel.name}` : `Topic can only be changed on text channels: ${channel.name}`)
        } else {
          await channel.setTopic(op.topic || "")
          results.push(language === "tr" ? `Kanal açıklaması değiştirildi: ${channel.name}` : `Updated topic for: ${channel.name}`)
        }
      }

      if (op.type === "move_channel") {
        let channel = null

        if (op.categoryName && op.channelName) {
          channel = findChannelInCategoryByName(guild, op.categoryName, op.channelName)
        } else if (op.channelName) {
          channel = findAnyChannelByName(guild, op.channelName)
        }

        if (!channel) {
          results.push(language === "tr" ? `Kanal bulunamadı: ${op.channelName}` : `Channel not found: ${op.channelName}`)
        } else {
          let targetCategory = findCategoryByName(guild, op.targetCategoryName)
          if (!targetCategory) {
            targetCategory = await guild.channels.create({
              name: slugify(op.targetCategoryName || "kategori"),
              type: ChannelType.GuildCategory
            })
            results.push(language === "tr" ? `Hedef kategori oluşturuldu: ${targetCategory.name}` : `Created target category: ${targetCategory.name}`)
          }

          await channel.setParent(targetCategory.id)
          results.push(language === "tr" ? `Kanal taşındı: ${channel.name} -> ${targetCategory.name}` : `Moved channel ${channel.name} to ${targetCategory.name}`)
        }
      }

      if (op.type === "rename_all_channels_in_category") {
        let category = null

        if (op.categoryName) {
          category = findCategoryByName(guild, op.categoryName)
        } else {
          const current = message.channel.parentId ? guild.channels.cache.get(message.channel.parentId) : null
          if (current?.type === ChannelType.GuildCategory) category = current
        }

        if (!category) {
          results.push(language === "tr" ? "Kategori bulunamadı." : "Category not found.")
        } else {
          const children = guild.channels.cache
            .filter(c => c.parentId === category.id && c.type !== ChannelType.GuildCategory)
            .sort((a, b) => a.rawPosition - b.rawPosition)

          if (!children.size) {
            results.push(language === "tr" ? `Kategoride kanal yok: ${category.name}` : `No channels in category: ${category.name}`)
          } else {
            let index = 1
            const base = slugify(op.baseName || "kanal") || "kanal"
            for (const [, ch] of children) {
              const nextName = index === 1 ? base : `${base}-${index}`
              await ch.setName(nextName)
              index++
            }
            results.push(language === "tr" ? `Kategorideki tüm kanallar yeniden adlandırıldı: ${category.name}` : `Renamed all channels in category: ${category.name}`)
          }
        }
      }

      if (op.type === "set_all_channel_topics_in_category") {
        let category = null

        if (op.categoryName) {
          category = findCategoryByName(guild, op.categoryName)
        } else {
          const current = message.channel.parentId ? guild.channels.cache.get(message.channel.parentId) : null
          if (current?.type === ChannelType.GuildCategory) category = current
        }

        if (!category) {
          results.push(language === "tr" ? "Kategori bulunamadı." : "Category not found.")
        } else {
          const children = guild.channels.cache
            .filter(c => c.parentId === category.id && c.type === ChannelType.GuildText)
            .sort((a, b) => a.rawPosition - b.rawPosition)

          if (!children.size) {
            results.push(language === "tr" ? `Açıklaması değiştirilebilecek yazı kanalı yok: ${category.name}` : `No text channels to update in category: ${category.name}`)
          } else {
            for (const [, ch] of children) {
              await ch.setTopic(op.topic || "")
            }
            results.push(language === "tr" ? `Kategorideki yazı kanallarının açıklamaları güncellendi: ${category.name}` : `Updated topics in category: ${category.name}`)
          }
        }
      }

      if (op.type === "delete_all_structure") {
        if (!isOwner(member)) {
          results.push(
            language === "tr"
              ? "Tüm kategori ve kanalları silme işlemi sadece sunucu sahibi tarafından kullanılabilir."
              : "Deleting all categories and channels can only be used by the server owner."
          )
        } else {
          const channels = guild.channels.cache
            .filter(c => c.id !== message.channel.id)
            .sort((a, b) => (b.parentId ? 1 : 0) - (a.parentId ? 1 : 0))

          for (const [, ch] of channels) {
            try {
              await ch.delete()
            } catch {}
          }

          results.push(
            language === "tr"
              ? "Mevcut kanal hariç tüm kategori ve kanallar silinmeye çalışıldı."
              : "All categories and channels except the current channel were attempted to be deleted."
          )
        }
      }
    } catch (err) {
      console.error("Management operation error:", op?.type, err)
      results.push(
        language === "tr"
          ? `İşlem başarısız: ${op.type}`
          : `Operation failed: ${op.type}`
      )
    }
  }

  if (!results.length) {
    await safeReply(
      message,
      language === "tr"
        ? "Yönetim isteğini algıladım ama net işlem çıkaramadım."
        : "I detected a management request but could not extract a clear action."
    )
    return true
  }

  await safeReply(message, results.join("\n"))
  return true
}

async function handleServerLanguageMode(message, mode) {
  const guildSettings = getGuildSettings(message.guild.id)
  const language = resolveLanguage(message.guild.id, message.author.id, message.content)

  if (!hasAdminAccess(message.member)) {
    await safeReply(
      message,
      language === "tr"
        ? "Sunucu dili ayarını sadece yönetici değiştirebilir."
        : "Only an administrator can change the server language setting."
    )
    return true
  }

  if (mode === "tr") {
    guildSettings.forcedLanguage = "tr"
    guildSettings.forcedLanguageBy = message.author.id
    saveGuildSettings()
    await safeReply(message, "Tamam, bu sunucuda ben artık Türkçe konuşacağım. Bunu sadece yönetici kaldırabilir.")
    return true
  }

  if (mode === "en") {
    guildSettings.forcedLanguage = "en"
    guildSettings.forcedLanguageBy = message.author.id
    saveGuildSettings()
    await safeReply(message, "Alright, I will now speak English in this server until an admin changes it.")
    return true
  }

  guildSettings.forcedLanguage = null
  guildSettings.forcedLanguageBy = null
  saveGuildSettings()
  await safeReply(
    message,
    language === "tr"
      ? "Tamam, sunucu dil kilidini kaldırdım. Yeniden otomatik dil algısına döndüm."
      : "Alright, I removed the server language lock and returned to automatic language detection."
  )
  return true
}

async function getChatReply(question, language, tone, replyProfile, userState, firstTime, guildSettings) {
  const recent = userState.recentMessages.slice(-6).join("\n")
  const styleInstruction = buildStyleInstruction(language, tone, replyProfile.style)

  const response = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text:
            `You are ${BOT_NAME}, a powerful Discord AI developed by ${FOUNDER_NAME}. ` +
            `You can answer questions, generate text, write code, help with decisions, host mini games, manage roles, manage server structure, and talk like a natural human assistant. ` +
            `You are warm, sharp, socially aware, and concise by default. ` +
            `If asked who you are, you may say: "${BOT_IDENTITY_EN}" ` +
            `If asked about your founder, say your founder is ${FOUNDER_NAME}. ` +
            `If the user wants a private talk, say you can open a private room. ` +
            `Respect the user's language and the server forced language if present. ${styleInstruction}`
        }]
      },
      {
        role: "system",
        content: [{
          type: "input_text",
          text:
            `Recent context from this same user:\n${recent || "No recent context."}\n\n` +
            `This is ${firstTime ? "the first meaningful interaction with this user today" : "not the first interaction with this user today"}. ` +
            `If it is the first one, a very brief greeting is okay. Otherwise, answer directly.\n\n` +
            `Server forced language: ${guildSettings.forcedLanguage || "none"}.`
        }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: question }]
      }
    ]
  })

  return (
    response.output_text?.trim() ||
    (language === "tr"
      ? "Şu an uygun bir cevap üretemedim."
      : "I couldn't generate a response right now.")
  )
}

process.on("unhandledRejection", error => {
  console.error("UNHANDLED_REJECTION:", error)
})

process.on("uncaughtException", error => {
  console.error("UNCAUGHT_EXCEPTION:", error)
})

client.on("error", error => {
  console.error("CLIENT_ERROR:", error)
})

client.on("shardError", error => {
  console.error("SHARD_ERROR:", error)
})

client.once(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`)

  readyClient.user.setPresence({
    activities: [
      {
        name: "Discord AI",
        type: ActivityType.Playing
      }
    ],
    status: "online"
  })
})

client.on(Events.GuildMemberAdd, async member => {
  try {
    const settings = getGuildSettings(member.guild.id)
    if (!settings.welcomeEnabled || !settings.welcomeChannelId) return

    const channel = member.guild.channels.cache.get(settings.welcomeChannelId)
    if (!channel || channel.type !== ChannelType.GuildText) return
    if (!canViewChannel(channel) || !canSendToChannel(channel)) return

    const lang = settings.forcedLanguage || "tr"

    await safeSend(
      channel,
      lang === "tr"
        ? `Hoş geldin ${member}! Ben ${BOT_NAME}. Beni etiketleyip soru sorabilir, yardım isteyebilir ya da sunucu yönetimi için kullanabilirsin.`
        : `Welcome ${member}! I am ${BOT_NAME}. You can mention me for questions, help, or server management.`
    )
  } catch (error) {
    console.error("GuildMemberAdd error:", error)
  }
})

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return
    if (!message.guild) return

    const hasTrigger = shouldRespond(message)
    const activeGame = getGame(message.channel.id)

    if (activeGame) {
      const result = await handleGameMessage(message, activeGame)

      if (result === "handoff_private") {
        const language = resolveLanguage(message.guild.id, message.author.id, message.content)
        await createPrivateChannel(message, language)
        return
      }

      if (result === "handoff_founder") {
        const language = resolveLanguage(message.guild.id, message.author.id, message.content)
        await safeReply(message, language === "tr" ? `Benim kurucum ${FOUNDER_NAME}.` : `My founder is ${FOUNDER_NAME}.`)
        return
      }

      if (result === "handoff_identity") {
        const language = resolveLanguage(message.guild.id, message.author.id, message.content)
        await safeReply(message, language === "tr" ? BOT_IDENTITY_TR : BOT_IDENTITY_EN)
        return
      }

      if (result === "handoff_new_game") {
        const language = resolveLanguage(message.guild.id, message.author.id, message.content)
        const gameType = chooseGame(message.content, language)
        await startGame(message, language, gameType)
        return
      }

      if (result === "handoff_language") {
        const mode = detectLanguageCommand(message.content)

        if (isServerLanguageCommand(message.content)) {
          await handleServerLanguageMode(message, mode)
          return
        }

        const state = getUserState(message.author.id)
        state.languageMode = mode
        saveUserMemory()

        if (mode === "tr") {
          await safeReply(message, "Tamam, seninle Türkçe devam edeceğim.")
        } else if (mode === "en") {
          await safeReply(message, "Alright, I will continue with you in English.")
        } else {
          await safeReply(message, "Tamam, senin için tekrar otomatik dil algısına döndüm.")
        }
        return
      }

      if (result === "handled") return
    }

    if (!hasTrigger) return

    if (repliedMessages.has(message.id)) return
    repliedMessages.add(message.id)
    setTimeout(() => repliedMessages.delete(message.id), 12000)

    if (isOnCooldown(message.author.id)) return
    setCooldown(message.author.id, 900)

    let question = message.content
    if (message.mentions.has(client.user)) {
      question = cleanMention(question, client.user.id)
    }

    question = question.replace(new RegExp(BOT_NAME, "ig"), "").trim()
    if (!question) question = message.content.trim()

    const state = getUserState(message.author.id)
    const guildSettings = getGuildSettings(message.guild.id)
    const langMode = detectLanguageCommand(question)

    if (langMode) {
      if (isServerLanguageCommand(question)) {
        await handleServerLanguageMode(message, langMode)
        return
      }

      state.languageMode = langMode
      saveUserMemory()

      if (langMode === "tr") {
        await safeReply(message, "Tamam, seninle Türkçe konuşacağım.")
      } else if (langMode === "en") {
        await safeReply(message, "Alright, I will speak English with you.")
      } else {
        await safeReply(message, "Tamam, yeniden otomatik dil algısına döndüm.")
      }
      return
    }

    const language = resolveLanguage(message.guild.id, message.author.id, question)
    const tone = detectTone(question)
    const replyProfile = getReplyProfile(question)

    state.tone = tone
    saveUserMessage(message.author.id, question)

    if (asksAboutFounder(question)) {
      await safeReply(message, language === "tr" ? `Benim kurucum ${FOUNDER_NAME}.` : `My founder is ${FOUNDER_NAME}.`)
      return
    }

    if (asksWhatAreYou(question)) {
      await safeReply(message, language === "tr" ? BOT_IDENTITY_TR : BOT_IDENTITY_EN)
      return
    }

    if (shouldOpenPrivateTalk(question)) {
      await createPrivateChannel(message, language)
      return
    }

    if (asksForGame(question)) {
      const gameType = chooseGame(question, language)
      await startGame(message, language, gameType)
      return
    }

    if (isLowSignal(question)) {
      await safeReply(
        message,
        language === "tr"
          ? "Bir tık daha net yazarsan daha iyi anlayıp daha iyi yardımcı olurum."
          : "If you phrase it a bit more clearly, I can help better."
      )
      return
    }

    await safeTyping(message.channel)

    const managementPlan = await detectManagementPlan(question, language)

    if (managementPlan.isManagementRequest) {
      const handled = await executeManagementPlan(message, managementPlan, language)
      if (handled) return
    }

    const firstTime = !greetedUsers.has(message.author.id)
    const reply = await getChatReply(question, language, tone, replyProfile, state, firstTime, guildSettings)

    greetedUsers.add(message.author.id)
    await safeReply(message, reply)
  } catch (error) {
    console.error("MESSAGE_CREATE_FATAL:", error)
    try {
      const language = message?.guild && message?.author
        ? resolveLanguage(message.guild.id, message.author.id, message.content || "")
        : "tr"

      await safeReply(
        message,
        language === "tr"
          ? "Şu an bir hata oluştu. Birkaç saniye sonra tekrar dene."
          : "I ran into an error. Try again in a few seconds."
      )
    } catch {}
  }
})

client.login(process.env.TOKEN)