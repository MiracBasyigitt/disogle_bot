require("dotenv").config()

const { Client, GatewayIntentBits, Events, ActivityType } = require("discord.js")
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
    await message.reply("Hello! How can I assist you today?")
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
            "You are Disogle, a smart conversational Discord AI. Reply in natural English. Be clear, confident, helpful, and concise. Avoid being robotic. Keep answers clean and readable for Discord. If the user is casual, sound casual. If the user asks for help, be practical."
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