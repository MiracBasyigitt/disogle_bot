require("dotenv").config()

const { Client, GatewayIntentBits, PermissionFlagsBits, Events } = require("discord.js")
const OpenAI = require("openai")

const { getLanguage, hasTrigger, stripTrigger } = require("./ai/language")
const { askAI } = require("./ai/chat")
const {
  detectModerationPlan,
  detectPurgePlan,
  detectManagementPlan
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
const { checkSpam } = require("./moderation/raidProtection")

const { getGuildSettings } = require("./database/guildSettings")

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

function isAdmin(member) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.guild.ownerId === member.id
  )
}

client.once(Events.ClientReady, () => {
  console.log(`✅ ${BOT_NAME} aktif: ${client.user.tag}`)
})

client.on(Events.GuildMemberAdd, async member => {
  await sendWelcomeMessage(member)
})

client.on(Events.MessageCreate, async message => {
  if (!message.guild) return
  if (message.author.bot) return

  const settings = getGuildSettings(message.guild.id)

  if (settings.spamProtection.enabled) {
    const spam = checkSpam(message, settings.spamProtection)

    if (spam) {
      await muteMember(
        message.guild,
        message.author.id,
        settings.spamProtection.muteMinutes * 60 * 1000,
        "Spam protection"
      )

      return message.channel.send(`🚨 ${message.author} muted for spam.`)
    }
  }

  if (!hasTrigger(message, client.user.id, BOT_NAME)) return

  const raw = stripTrigger(message, client.user.id, BOT_NAME)
  const content = String(raw || "").trim()
  if (!content) return

  const language = getLanguage(content)

  try {
    const voiceResult = await handleVoiceCommand(message, content)
    if (voiceResult) {
      return message.reply(voiceResult.message)
    }

    const moderationPlan = detectModerationPlan(message, content, language)
    if (moderationPlan.isModerationRequest) {
      if (!isAdmin(message.member)) {
        return message.reply("Admin olman gerekiyor.")
      }

      if (moderationPlan.action === "ban") {
        const r = await banMember(message.guild, moderationPlan.targetId)
        return message.reply(r.message)
      }

      if (moderationPlan.action === "kick") {
        const r = await kickMember(message.guild, moderationPlan.targetId)
        return message.reply(r.message)
      }

      if (moderationPlan.action === "mute") {
        const r = await muteMember(
          message.guild,
          moderationPlan.targetId,
          moderationPlan.durationMs
        )
        return message.reply(r.message)
      }

      if (moderationPlan.action === "unmute") {
        const r = await unmuteMember(message.guild, moderationPlan.targetId)
        return message.reply(r.message)
      }
    }

    const purgePlan = detectPurgePlan(message, content)
    if (purgePlan.isPurgeRequest) {
      if (!isAdmin(message.member)) {
        return message.reply("Admin olman gerekiyor.")
      }

      const r = await purgeMessages(message.channel, purgePlan.amount)
      return message.reply(r.message)
    }

    if (content.toLowerCase().includes("warn")) {
      if (!isAdmin(message.member)) return
      const target = message.mentions.members.first()
      if (!target) return
      const r = await warnMember(message.guild, target.id, "Manual warn")
      return message.reply(r.message)
    }

    if (content.toLowerCase().includes("analytics")) {
      const text = formatGuildAnalytics(message.guild, language)
      return message.reply(text)
    }

    if (content.toLowerCase().includes("sunucu kur") ||
        content.toLowerCase().includes("server kur")) {

      if (!isAdmin(message.member)) return

      const result = await buildStarterServer(message.guild, language)
      return message.reply(result)
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
        return message.reply("Admin olman gerekiyor.")
      }

      const result = await executeManagementPlan(
        message.guild,
        message.member,
        managementPlan,
        language
      )

      return message.reply(result)
    }

    const ai = await askAI(openai, MODEL, language, content)

    return message.reply(ai || "Buradayım.")

  } catch (err) {
    console.error(err)
    message.reply("Bir hata oldu.")
  }
})

client.login(process.env.DISCORD_TOKEN)