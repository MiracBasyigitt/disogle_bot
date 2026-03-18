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
const userMemory = new Map()
const activeGames = new Map()

const BOT_NAME = "Disogle"
const FOUNDER_NAME = "Miraç Başyiğit"
const BOT_IDENTITY_EN = "Disogle is an AI-based chatbot developed by Miraç Başyiğit that can generate human-like text, answer questions, and write code."
const BOT_IDENTITY_TR = "Disogle, Miraç Başyiğit tarafından geliştirilen; insan benzeri metin üretebilen, soruları cevaplayabilen ve kod yazabilen yapay zeka tabanlı bir sohbet botudur."

const riddles = [
  {
    questionTR: "Benim dişlerim var ama ısıramam. Ben neyim?",
    answerTR: "tarak",
    questionEN: "I have teeth but I cannot bite. What am I?",
    answerEN: "comb"
  },
  {
    questionTR: "Kırıldıkça kullanılabilirim. Ben neyim?",
    answerTR: "yumurta",
    questionEN: "The more I am broken, the more I am used. What am I?",
    answerEN: "egg"
  },
  {
    questionTR: "Konuşmadan anlatırım, ağzım yoktur. Ben neyim?",
    answerTR: "kitap",
    questionEN: "I can tell stories without speaking. I have no mouth. What am I?",
    answerEN: "book"
  }
]

const wouldYouRatherTR = [
  "Hiç uyumadan yaşayabilmek mi, hiç para derdin olmaması mı?",
  "Zihin okuyabilmek mi, görünmez olmak mı?",
  "Geçmişe gitmek mi, geleceği görmek mi?"
]

const wouldYouRatherEN = [
  "Would you rather never need sleep or never worry about money?",
  "Would you rather read minds or become invisible?",
  "Would you rather travel to the past or see the future?"
]

const triviaTR = [
  { q: "Türkiye'nin başkenti neresidir?", a: "ankara" },
  { q: "Dünyanın en büyük okyanusu hangisidir?", a: "pasifik" },
  { q: "2 + 2 x 2 kaç eder?", a: "6" }
]

const triviaEN = [
  { q: "What is the capital of France?", a: "paris" },
  { q: "Which planet is known as the Red Planet?", a: "mars" },
  { q: "What is 2 + 2 x 2?", a: "6" }
]

function cleanMention(content, botId) {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim()
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
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

function getUserState(userId) {
  if (!userMemory.has(userId)) {
    userMemory.set(userId, {
      language: "auto",
      recentMessages: [],
      tone: "neutral",
      lastTopic: "",
      name: ""
    })
  }
  return userMemory.get(userId)
}

function saveUserMessage(userId, username, message) {
  const state = getUserState(userId)
  state.name = username
  state.recentMessages.push(message)
  if (state.recentMessages.length > 6) state.recentMessages.shift()
}

function detectLanguage(text) {
  const lower = text.toLowerCase()
  const trHints = ["merhaba", "selam", "neden", "nasıl", "miyim", "mısın", "değil", "şey", "kurucun", "özel", "konuş", "yapar", "bana", "senin", "türkçe"]
  const enHints = ["hello", "what", "why", "how", "can you", "founder", "private", "talk", "write", "code", "english"]

  const trScore = trHints.filter(h => lower.includes(h)).length
  const enScore = enHints.filter(h => lower.includes(h)).length

  if (trScore > enScore) return "tr"
  if (enScore > trScore) return "en"

  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return "tr"
  return "en"
}

function detectTone(text) {
  const lower = text.toLowerCase()

  if (/[!?]{2,}/.test(text) || lower.includes("wow") || lower.includes("inanılmaz")) return "excited"
  if (lower.includes("üzgün") || lower.includes("kötü") || lower.includes("berbat") || lower.includes("sad")) return "soft"
  if (lower.includes("lan") || lower.includes("lol") || lower.includes("jsjs") || lower.includes("haha") || lower.includes("gül")) return "casual"
  if (lower.includes("please") || lower.includes("yardım") || lower.includes("help")) return "helpful"

  return "neutral"
}

function getReplyProfile(text) {
  const len = text.trim().length

  if (len <= 5) return { maxTokens: 40, style: "very_short" }
  if (len <= 18) return { maxTokens: 70, style: "short" }
  if (len <= 60) return { maxTokens: 140, style: "medium" }
  return { maxTokens: 240, style: "detailed" }
}

function isLowSignal(text) {
  const clean = normalize(text)
  if (!clean) return true
  if (clean.length <= 2) return true
  if (/^(lan|la|hee|he|hm|hmm|ok|tamam|yo|yok|evet|hayır|lol|xd)$/i.test(clean)) return true
  return false
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
    "özel konuş",
    "özel konuşalım",
    "seninle özel konuşabilir miyim",
    "özel oda aç",
    "özel konuşma aç"
  ].some(trigger => lower.includes(trigger))
}

function asksAboutFounder(text) {
  const lower = text.toLowerCase()

  return [
    "who is your founder",
    "who made you",
    "who created you",
    "who built you",
    "who owns you",
    "founder",
    "creator",
    "kurucun kim",
    "seni kim yaptı",
    "seni kim geliştirdi",
    "kurucu kim"
  ].some(trigger => lower.includes(trigger))
}

function asksWhatAreYou(text) {
  const lower = text.toLowerCase()

  return [
    "what are you",
    "who are you",
    "what do you do",
    "what can you do",
    "sen nesin",
    "sen kimsin",
    "ne yapıyorsun",
    "ne yapabiliyorsun"
  ].some(trigger => lower.includes(trigger))
}

function asksForGame(text) {
  const lower = text.toLowerCase()

  return [
    "oyun oynayalım",
    "oyun başlat",
    "bir oyun oyna",
    "let's play",
    "play a game",
    "start a game",
    "mini game"
  ].some(trigger => lower.includes(trigger))
}

function chooseGame(text, language) {
  const lower = text.toLowerCase()

  if (lower.includes("riddle") || lower.includes("bilmece")) return "riddle"
  if (lower.includes("trivia")) return "trivia"
  if (lower.includes("number") || lower.includes("sayı")) return "number"
  if (lower.includes("would you rather") || lower.includes("hangisini seçerdin")) return "wyr"

  return language === "tr" ? "riddle" : "riddle"
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

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function createPrivateChannel(message, language) {
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
    const content =
      language === "tr"
        ? `Zaten açık bir özel odan var: ${existing}`
        : `You already have an active private room here: ${existing}`

    await message.reply(content)
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

  const intro =
    language === "tr"
      ? `Merhaba ${member}, özel konuşma odan hazır.\n\nBurada daha rahat konuşabilirsin. Hazırsan yaz, ben buradayım.\n\nKurucum ${FOUNDER_NAME}.`
      : `Hey ${member}, your private room is ready.\n\nYou can talk more freely here. Send a message whenever you're ready.\n\nMy founder is ${FOUNDER_NAME}.`

  await privateChannel.send(intro)

  const reply =
    language === "tr"
      ? `Özel odan hazır: ${privateChannel}`
      : `Your private session is ready: ${privateChannel}`

  await message.reply(reply)
}

async function startGame(message, language, gameType) {
  if (gameType === "riddle") {
    const riddle = language === "tr" ? randomItem(riddles) : randomItem(riddles)
    createGame(message.channel.id, {
      type: "riddle",
      language,
      answer: language === "tr" ? riddle.answerTR : riddle.answerEN
    })

    await message.reply(
      language === "tr" ? `Bilmece zamanı:\n${riddle.questionTR}` : `Riddle time:\n${riddle.questionEN}`
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

    await message.reply(
      language === "tr" ? `Soru:\n${trivia.q}` : `Trivia:\n${trivia.q}`
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

    await message.reply(
      language === "tr"
        ? "1 ile 10 arasında bir sayı tuttum. Tahmin et."
        : "I picked a number between 1 and 10. Guess it."
    )
    return
  }

  if (gameType === "wyr") {
    const question = language === "tr" ? randomItem(wouldYouRatherTR) : randomItem(wouldYouRatherEN)
    await message.reply(question)
  }
}

async function handleGameReply(message, game) {
  const answer = normalize(message.content)

  if (!answer) return false

  if (answer === normalize(game.answer)) {
    clearGame(message.channel.id)
    await message.reply(
      game.language === "tr"
        ? "Doğru bildin. Güzel oynadın."
        : "Correct. Nice one."
    )
    return true
  }

  if (game.type === "number" && /^\d+$/.test(answer)) {
    await message.reply(
      game.language === "tr"
        ? "Olmadı. Bir daha dene."
        : "Not that one. Try again."
    )
    return true
  }

  if (game.type === "trivia" || game.type === "riddle") {
    if (answer.length > 1) {
      await message.reply(
        game.language === "tr"
          ? "Henüz doğru değil. Bir daha düşün."
          : "Not correct yet. Think again."
      )
      return true
    }
  }

  return false
}

function buildStyleInstruction(language, tone, replyStyle) {
  const langPart =
    language === "tr"
      ? "Reply in natural Turkish."
      : "Reply in natural English."

  const toneMap = {
    excited: language === "tr"
      ? "Match excitement only if the user is genuinely excited. Do not overact."
      : "Match excitement only if the user is genuinely excited. Do not overact.",
    soft: language === "tr"
      ? "Be softer, calmer and more reassuring."
      : "Be softer, calmer and more reassuring.",
    casual: language === "tr"
      ? "Sound natural and casual, but not childish."
      : "Sound natural and casual, but not childish.",
    helpful: language === "tr"
      ? "Be practical and focused."
      : "Be practical and focused.",
    neutral: language === "tr"
      ? "Stay calm, natural and balanced."
      : "Stay calm, natural and balanced."
  }

  const sizeMap = {
    very_short: language === "tr"
      ? "Keep it very short."
      : "Keep it very short.",
    short: language === "tr"
      ? "Keep it short."
      : "Keep it short.",
    medium: language === "tr"
      ? "Keep it concise but complete."
      : "Keep it concise but complete.",
    detailed: language === "tr"
      ? "Be more detailed, but stay readable."
      : "Be more detailed, but stay readable."
  }

  return `${langPart} ${toneMap[tone]} ${sizeMap[replyStyle]} Use emojis only when they fit naturally. Do not sound overexcited by default.`
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

  const activeGame = getGame(message.channel.id)
  if (activeGame) {
    const handled = await handleGameReply(message, activeGame)
    if (handled) return
  }

  if (!message.mentions.has(client.user)) return

  if (repliedMessages.has(message.id)) return
  repliedMessages.add(message.id)
  setTimeout(() => repliedMessages.delete(message.id), 15000)

  if (isOnCooldown(message.author.id)) return
  setCooldown(message.author.id, 2200)

  const question = cleanMention(message.content, client.user.id)
  const language = detectLanguage(question || message.content)
  const tone = detectTone(question || message.content)

  saveUserMessage(message.author.id, message.author.username, question || message.content)

  const state = getUserState(message.author.id)
  state.language = language
  state.tone = tone

  if (!question) {
    await message.reply(
      language === "tr"
        ? "Buradayım. Ne hakkında konuşmak istersin?"
        : "I'm here. What would you like to talk about?"
    )
    return
  }

  if (asksAboutFounder(question)) {
    await message.reply(
      language === "tr"
        ? `Benim kurucum ${FOUNDER_NAME}. Başka merak ettiğin bir şey var mı?`
        : `My founder is ${FOUNDER_NAME}. What else would you like to know?`
    )
    return
  }

  if (asksWhatAreYou(question)) {
    await message.reply(language === "tr" ? BOT_IDENTITY_TR : BOT_IDENTITY_EN)
    return
  }

  if (shouldOpenPrivateTalk(question)) {
    try {
      await createPrivateChannel(message, language)
    } catch (error) {
      console.error("PRIVATE CHANNEL ERROR:", error)
      await message.reply(
        language === "tr"
          ? "Özel oda açarken bir hata oluştu."
          : "I hit an error while creating the private room."
      )
    }
    return
  }

  if (asksForGame(question)) {
    const gameType = chooseGame(question, language)
    await startGame(message, language, gameType)
    return
  }

  if (isLowSignal(question)) {
    await message.reply(
      language === "tr"
        ? "Daha net yazarsan daha iyi yardımcı olabilirim."
        : "If you say it a bit more clearly, I can help better."
    )
    return
  }

  const replyProfile = getReplyProfile(question)
  const styleInstruction = buildStyleInstruction(language, tone, replyProfile.style)

  try {
    await message.channel.sendTyping()

    const recent = state.recentMessages.slice(-4).join("\n")

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `You are ${BOT_NAME}, a smart conversational Discord AI with a calm, natural, adaptive personality. You were developed by ${FOUNDER_NAME}. You can answer questions, write code, explain ideas, brainstorm, chat naturally, and run light games. Never sound robotic. Never be overly excited by default. Match the user's emotional energy only when it feels natural. Keep answers suitable for Discord. If asked who you are, you may say: "${BOT_IDENTITY_EN}" If asked about your founder, say your founder is ${FOUNDER_NAME}. If the user wants private talk, say you can open a private room. ${styleInstruction}`
        },
        {
          role: "system",
          content:
            `Recent context from this same user:\n${recent || "No recent context."}`
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.75,
      max_tokens: replyProfile.maxTokens
    })

    const reply =
      response.choices?.[0]?.message?.content?.trim() ||
      (language === "tr" ? "Şu an uygun bir cevap üretemedim." : "I couldn't generate a response right now.")

    await message.reply(reply)
  } catch (error) {
    console.error("OPENAI ERROR:", error)
    await message.reply(
      language === "tr"
        ? "Şu an bir hata oluştu. Birazdan tekrar dene."
        : "I ran into an error. Try again in a moment."
    )
  }
})

client.login(process.env.TOKEN)