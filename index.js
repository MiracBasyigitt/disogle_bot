require("dotenv").config()

const { Client, GatewayIntentBits, PermissionFlagsBits, Events } = require("discord.js")
const OpenAI = require("openai")

const {
  getLanguage,
  hasTrigger,
  stripTrigger,
  prefersEnglish,
  prefersTurkish
} = require("./ai/language")

const { askAI } = require("./ai/chat")

const {
  detectModerationPlan,
  detectPurgePlan,
  detectManagementPlan,
  detectAnalyticsIntent,
  detectBuilderPlan
} = require("./ai/intentParser")

const { executeManagementPlan } = require("./systems/channelManager")
const { formatGuildAnalytics } = require("./systems/analytics")
const { buildStarterServer } = require("./systems/builderMode")
const { sendWelcomeMessage } = require("./systems/welcomeSystem")

const { purgeMessages } = require("./moderation/purge")
const { banMember } = require("./moderation/ban")
const { kickMember } = require("./moderation/kick")
const { muteMember, unmuteMember } = require("./moderation/mute")
const { warnMember } = require("./moderation/warn")
const { checkSpam, trackJoinForRaid, detectRaid } = require("./moderation/raidProtection")

const { getGuildSettings, updateGuildSettings } = require("./database/guildSettings")
const { getUserMemory, updateUserMemory, pushRecentMessage, setLastIntent } = require("./database/userMemory")

const { handleVoiceCommand } = require("./voice/voiceCommands")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  allowedMentions: {
    repliedUser: false
  }
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const MODEL = process.env.MODEL || "gpt-5.4"
const BOT_NAME = process.env.BOT_NAME || "Disogle"

const cooldowns = new Map()

function isAdmin(member) {
  if (!member) return false
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.guild.ownerId === member.id
  )
}

function isOnCooldown(userId) {
  const until = cooldowns.get(userId)
  if (!until) return false
  if (Date.now() >= until) {
    cooldowns.delete(userId)
    return false
  }
  return true
}

function setCooldown(userId, ms) {
  cooldowns.set(userId, Date.now() + ms)
}

async function safeReply(message, content) {
  try {
    return await message.reply({
      content: String(content || ""),
      allowedMentions: { repliedUser: false }
    })
  } catch {
    try {
      return await message.channel.send({
        content: `${message.author} ${String(content || "")}`,
        allowedMentions: { users: [message.author.id] }
      })
    } catch {
      return null
    }
  }
}

function resolveLanguage(messageContent, guildSettings, userMemory) {
  if (prefersEnglish(messageContent)) return "en"
  if (prefersTurkish(messageContent)) return "tr"

  if (guildSettings.forcedLanguage === "en") return "en"
  if (guildSettings.forcedLanguage === "tr") return "tr"

  if (userMemory.languageMode === "en") return "en"
  if (userMemory.languageMode === "tr") return "tr"

  return getLanguage(messageContent) || guildSettings.defaultLanguage || "en"
}

function localized(textEn, textTr, language) {
  return language === "tr" ? textTr : textEn
}

client.once(Events.ClientReady, () => {
  console.log(`✅ ${BOT_NAME} active: ${client.user.tag}`)
})

client.on(Events.GuildMemberAdd, async member => {
  try {
    await sendWelcomeMessage(member)

    const settings = getGuildSettings(member.guild.id)
    const joinCount = trackJoinForRaid(member.guild.id)

    if (detectRaid(member.guild.id, 8)) {
      const systemChannel = member.guild.systemChannel
      if (systemChannel && typeof systemChannel.send === "function") {
        await systemChannel.send(
          settings.defaultLanguage === "tr"
            ? `🚨 Olası raid algılandı. Kısa sürede ${joinCount} yeni giriş oldu.`
            : `🚨 Possible raid detected. ${joinCount} new joins happened in a short time.`
        ).catch(() => null)
      }
    }
  } catch (error) {
    console.error("GuildMemberAdd error:", error)
  }
})

client.on(Events.MessageCreate, async message => {
  if (!message.guild) return
  if (message.author.bot) return

  const guildSettings = getGuildSettings(message.guild.id)
  const userMemory = getUserMemory(message.author.id)

  pushRecentMessage(message.author.id, message.content)

  if (guildSettings.spamProtection?.enabled) {
    const spam = checkSpam(message, guildSettings.spamProtection)

    if (spam) {
      const muted = await muteMember(
        message.guild,
        message.author.id,
        Number(guildSettings.spamProtection.muteMinutes || 15) * 60 * 1000,
        "Spam protection"
      ).catch(() => null)

      if (muted?.ok) {
        await safeReply(
          message,
          localized(
            `🚨 ${message.author} was muted for spam.`,
            `🚨 ${message.author} spam nedeniyle susturuldu.`,
            guildSettings.defaultLanguage || "en"
          )
        )
      }

      return
    }
  }

  if (!hasTrigger(message, client.user.id, BOT_NAME)) return
  if (isOnCooldown(message.author.id)) return

  const content = stripTrigger(message, client.user.id, BOT_NAME).trim()
  if (!content) return

  const language = resolveLanguage(content, guildSettings, userMemory)

  updateUserMemory(message.author.id, current => ({
    ...current,
    lastDetectedLanguage: language,
    preferredLanguage: language === "tr" ? "tr" : "en"
  }))

  try {
    const lowered = content.toLowerCase()

    if (lowered.includes("speak english by default") || lowered.includes("default language english")) {
      if (!isAdmin(message.member)) {
        return await safeReply(message, localized("You need admin permission.", "Yönetici olman gerekiyor.", language))
      }

      updateGuildSettings(message.guild.id, current => ({
        ...current,
        defaultLanguage: "en"
      }))

      return await safeReply(message, "Default language set to English.")
    }

    if (lowered.includes("varsayilan dili ingilizce yap") || lowered.includes("sunucuda varsayilan dili ingilizce yap")) {
      if (!isAdmin(message.member)) {
        return await safeReply(message, "Yönetici olman gerekiyor.")
      }

      updateGuildSettings(message.guild.id, current => ({
        ...current,
        defaultLanguage: "en"
      }))

      return await safeReply(message, "Varsayılan dil İngilizce yapıldı.")
    }

    if (lowered.includes("force english") || lowered.includes("sunucuda hep ingilizce konus")) {
      if (!isAdmin(message.member)) {
        return await safeReply(message, localized("You need admin permission.", "Yönetici olman gerekiyor.", language))
      }

      updateGuildSettings(message.guild.id, current => ({
        ...current,
        forcedLanguage: "en"
      }))

      return await safeReply(message, "Forced language set to English.")
    }

    if (lowered.includes("force turkish") || lowered.includes("sunucuda hep turkce konus")) {
      if (!isAdmin(message.member)) {
        return await safeReply(message, localized("You need admin permission.", "Yönetici olman gerekiyor.", language))
      }

      updateGuildSettings(message.guild.id, current => ({
        ...current,
        forcedLanguage: "tr"
      }))

      return await safeReply(message, "Zorunlu dil Türkçe yapıldı.")
    }

    if (lowered.includes("remove forced language") || lowered.includes("zorunlu dili kaldir")) {
      if (!isAdmin(message.member)) {
        return await safeReply(message, localized("You need admin permission.", "Yönetici olman gerekiyor.", language))
      }

      updateGuildSettings(message.guild.id, current => ({
        ...current,
        forcedLanguage: null
      }))

      return await safeReply(
        message,
        localized("Forced language removed.", "Zorunlu dil kaldırıldı.", language)
      )
    }

    const voiceResult = await handleVoiceCommand(message, content, language, guildSettings)
    if (voiceResult) {
      setLastIntent(message.author.id, "voice")
      updateUserMemory(message.author.id, current => ({
        ...current,
        profile: {
          ...current.profile,
          usesVoiceCommands: true
        }
      }))
      setCooldown(message.author.id, 1000)
      return await safeReply(message, voiceResult.message)
    }

    const moderationPlan = detectModerationPlan(message, content, language)
    if (moderationPlan.isModerationRequest) {
      if (!isAdmin(message.member)) {
        return await safeReply(
          message,
          localized("You need admin permission.", "Yönetici olman gerekiyor.", language)
        )
      }

      setLastIntent(message.author.id, "moderation")

      if (moderationPlan.action === "ban") {
        const result = await banMember(message.guild, moderationPlan.targetId, moderationPlan.reason)
        setCooldown(message.author.id, 1000)
        return await safeReply(message, result.message)
      }

      if (moderationPlan.action === "kick") {
        const result = await kickMember(message.guild, moderationPlan.targetId, moderationPlan.reason)
        setCooldown(message.author.id, 1000)
        return await safeReply(message, result.message)
      }

      if (moderationPlan.action === "mute") {
        const result = await muteMember(
          message.guild,
          moderationPlan.targetId,
          moderationPlan.durationMs,
          moderationPlan.reason
        )
        setCooldown(message.author.id, 1000)
        return await safeReply(message, result.message)
      }

      if (moderationPlan.action === "unmute") {
        const result = await unmuteMember(message.guild, moderationPlan.targetId, moderationPlan.reason)
        setCooldown(message.author.id, 1000)
        return await safeReply(message, result.message)
      }

      if (moderationPlan.action === "warn") {
        const result = await warnMember(message.guild, moderationPlan.targetId, moderationPlan.reason)
        setCooldown(message.author.id, 1000)
        return await safeReply(message, result.message)
      }
    }

    const purgePlan = detectPurgePlan(message, content)
    if (purgePlan.isPurgeRequest) {
      if (!isAdmin(message.member)) {
        return await safeReply(
          message,
          localized("You need admin permission to purge messages.", "Mesaj silmek için yönetici olman gerekiyor.", language)
        )
      }

      setLastIntent(message.author.id, "purge")
      const result = await purgeMessages(message.channel, purgePlan.amount, message.author.id)
      setCooldown(message.author.id, 1000)
      return await safeReply(message, result.message)
    }

    if (detectAnalyticsIntent(content)) {
      setLastIntent(message.author.id, "analytics")
      const analytics = formatGuildAnalytics(message.guild, language)
      setCooldown(message.author.id, 1000)
      return await safeReply(message, analytics)
    }

    const builderPlan = detectBuilderPlan(content, language)
    if (builderPlan.isBuilderRequest) {
      if (!isAdmin(message.member)) {
        return await safeReply(
          message,
          localized("You need admin permission to build the server.", "Sunucuyu kurmak için yönetici olman gerekiyor.", language)
        )
      }

      setLastIntent(message.author.id, "builder")
      updateUserMemory(message.author.id, current => ({
        ...current,
        profile: {
          ...current.profile,
          usesManagementCommands: true
        }
      }))

      const result = await buildStarterServer(
        message.guild,
        builderPlan.language || "en",
        {
          includeRoles: builderPlan.includeRoles ?? true,
          includeWelcome: guildSettings.builder?.includeWelcome ?? true,
          includeVoice: guildSettings.builder?.includeVoice ?? true
        }
      )

      setCooldown(message.author.id, 1500)
      return await safeReply(message, result)
    }

    const managementPlan = await detectManagementPlan(
      openai,
      MODEL,
      message.guild,
      message.member,
      content,
      language
    )

    if (managementPlan.isManagementRequest) {
      if (!isAdmin(message.member)) {
        return await safeReply(
          message,
          localized("You need admin permission for server management.", "Sunucu yönetimi için yönetici olman gerekiyor.", language)
        )
      }

      setLastIntent(message.author.id, "management")
      updateUserMemory(message.author.id, current => ({
        ...current,
        profile: {
          ...current.profile,
          usesManagementCommands: true
        }
      }))

      const result = await executeManagementPlan(
        message.guild,
        message.member,
        managementPlan,
        language
      )

      setCooldown(message.author.id, 1200)
      return await safeReply(message, result)
    }

    setLastIntent(message.author.id, "chat")
    const aiReply = await askAI(openai, MODEL, language, content)
    setCooldown(message.author.id, Number(guildSettings.chatCooldownMs || 1200))
    return await safeReply(
      message,
      aiReply || localized("I'm here.", "Buradayım.", language)
    )
  } catch (error) {
    console.error("MessageCreate error:", error)
    return await safeReply(
      message,
      localized(
        "Something went wrong. Try phrasing the command more clearly.",
        "Bir hata oldu. Komutu daha net yaz.",
        language
      )
    )
  }
})

client.login(process.env.DISCORD_TOKEN)