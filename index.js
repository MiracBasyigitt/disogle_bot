require("dotenv").config()

const {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
  ChannelType,
  PermissionsBitField
} = require("discord.js")
const OpenAI = require("openai")

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const repliedMessages = new Set()
const userCooldowns = new Map()

function cleanMention(content, botId) {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim()
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

function shouldOpenPrivateTalk(text) {
  const lower = text.toLowerCase()

  return [
    "i want private talk",
    "private talk",
    "private session",
    "open private session",
    "open private talk",
    "can we talk private",
    "i need private help",
    "private help"
  ].some(trigger => lower.includes(trigger))
}

function asksAboutFounder(text) {
  const lower = text.toLowerCase()

  return (
    lower.includes("who is your founder") ||
    lower.includes("who made you") ||
    lower.includes("who created you") ||
    lower.includes("who built you") ||
    lower.includes("who owns you") ||
    lower.includes("founder") ||
    lower.includes("creator")
  )
}

async function createPrivateChannel(message) {
  const guild = message.guild
  const member = message.member
  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)
  const channelName = `private-${safeName || "user"}`

  const existing = guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildText &&
      channel.name === channelName
  )

  if (existing) {
    await message.reply(`You already have a private session here: ${existing}`)
    return
  }

  const privateChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: member.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels
        ]
      }
    ]
  })

  await privateChannel.send(
    `Hey ${member}, welcome to your private session.\n\nYou can talk to me here freely. Ask anything and I’ll focus on helping you.\n\nMy founder is Miraç Başyiğit.`
  )

  await message.reply(`Your private session is ready: ${privateChannel}`)
}

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

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return
  if (!message.guild) return
  if (!message.mentions.has(client.user)) return

  if (repliedMessages.has(message.id)) return
  repliedMessages.add(message.id)
  setTimeout(() => repliedMessages.delete(message.id), 15000)

  if (isOnCooldown(message.author.id)) return
  setCooldown(message.author.id, 2500)

  const question = cleanMention(message.content, client.user.id)

  if (!question) {
    await message.reply("Hello! I’m Disogle. How can I assist you today?")
    return
  }

  if (shouldOpenPrivateTalk(question)) {
    try {
      await createPrivateChannel(message)
    } catch (error) {
      console.error("PRIVATE CHANNEL ERROR:", error)
      await message.reply("I couldn’t create a private session channel.")
    }
    return
  }

  if (asksAboutFounder(question)) {
    await message.reply("My founder is Miraç Başyiğit.")
    return
  }

  try {
    await message.channel.sendTyping()

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Disogle, a smart conversational Discord AI with a confident and warm personality. You are helpful, natural, sharp, and easy to talk to. Keep replies clean and readable for Discord. You can chat casually, answer questions, guide communities, and support users. If someone asks about your founder, say your founder is Miraç Başyiğit. If someone wants a private talk, tell them you can open a private session. Never say you are generic or just an assistant. You are Disogle."
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.8,
      max_tokens: 250
    })

    const reply =
      response.choices?.[0]?.message?.content?.trim() ||
      "I couldn't generate a response."

    await message.reply(reply)
  } catch (error) {
    console.error("OPENAI ERROR:", error)
    await message.reply("AI error. Check console.")
  }
})

client.login(process.env.TOKEN)