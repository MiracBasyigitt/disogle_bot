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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const BOT_NAME = "Disogle"
const BOT_NAME_LOWER = BOT_NAME.toLowerCase()
const FOUNDER_NAME = "Miraç Başyiğit"
const MODEL_NAME = process.env.OPENAI_MODEL || "gpt-4o-mini"

const repliedMessages = new Set()
const userCooldowns = new Map()
const userMemory = new Map()
const activeGames = new Map()
const recentChannelReplies = new Map()

const BOT_IDENTITY_TR = "Ben Disogle. Miraç Başyiğit tarafından geliştirilen bir yapay zeka sohbet botuyum. Soruları cevaplarım, fikir üretirim, sohbet ederim ve bazı mini oyunlar oynatabilirim."
const BOT_IDENTITY_EN = "I am Disogle, an AI chatbot developed by Miraç Başyiğit. I can answer questions, brainstorm, chat naturally, and run mini games."

const riddles = [
  {
    questionTR: "Benim dişlerim var ama ısıramam. Ben neyim?",
    answerTR: "tarak",
    hintTR: "Saçla ilgilidir.",
    questionEN: "I have teeth but I cannot bite. What am I?",
    answerEN: "comb",
    hintEN: "It is related to hair."
  },
  {
    questionTR: "Kırıldıkça kullanılabilirim. Ben neyim?",
    answerTR: "yumurta",
    hintTR: "Mutfakla ilgilidir.",
    questionEN: "The more I am broken, the more I am used. What am I?",
    answerEN: "egg",
    hintEN: "It is related to cooking."
  },
  {
    questionTR: "Konuşmadan anlatırım, ağzım yoktur. Ben neyim?",
    answerTR: "kitap",
    hintTR: "Okunur.",
    questionEN: "I can tell stories without speaking. I have no mouth. What am I?",
    answerEN: "book",
    hintEN: "You read it."
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
  { q: "Türkiye'nin başkenti neresidir?", a: "ankara", hint: "İstanbul değil." },
  { q: "Dünyanın en büyük okyanusu hangisidir?", a: "pasifik", hint: "Atlas değil." },
  { q: "2 + 2 x 2 kaç eder?", a: "6", hint: "İşlem önceliğini düşün." }
]

const triviaEN = [
  { q: "What is the capital of France?", a: "paris", hint: "It starts with P." },
  { q: "Which planet is known as the Red Planet?", a: "mars", hint: "Not Earth." },
  { q: "What is 2 + 2 x 2?", a: "6", hint: "Think about order of operations." }
]

function cleanMention(content, botId) {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim()
}

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
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
      recentReplies: [],
      tone: "neutral",
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

function saveAssistantReply(userId, reply) {
  const state = getUserState(userId)
  state.recentReplies.push(reply)
  if (state.recentReplies.length > 4) state.recentReplies.shift()
}

function detectLanguage(text) {
  const lower = (text || "").toLowerCase()
  const trHints = ["merhaba", "selam", "neden", "nasıl", "miyim", "mısın", "değil", "şey", "kurucun", "özel", "konuş", "bana", "senin", "türkçe", "soru", "ipucu", "geç"]
  const enHints = ["hello", "what", "why", "how", "can you", "founder", "private", "talk", "write", "code", "english", "hint", "skip", "question"]

  const trScore = trHints.filter(h => lower.includes(h)).length
  const enScore = enHints.filter(h => lower.includes(h)).length

  if (trScore > enScore) return "tr"
  if (enScore > trScore) return "en"
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text || "")) return "tr"
  return "en"
}

function detectTone(text) {
  const lower = (text || "").toLowerCase()
  if (/[!?]{2,}/.test(text || "") || lower.includes("wow") || lower.includes("inanılmaz")) return "excited"
  if (lower.includes("üzgün") || lower.includes("kötü") || lower.includes("berbat") || lower.includes("sad")) return "soft"
  if (lower.includes("lan") || lower.includes("lol") || lower.includes("jsjs") || lower.includes("haha") || lower.includes("gül")) return "casual"
  if (lower.includes("please") || lower.includes("yardım") || lower.includes("help")) return "helpful"
  return "neutral"
}

function getReplyProfile(text) {
  const len = (text || "").trim().length
  if (len <= 5) return { maxTokens: 40, style: "very_short" }
  if (len <= 18) return { maxTokens: 80, style: "short" }
  if (len <= 60) return { maxTokens: 150, style: "medium" }
  return { maxTokens: 260, style: "detailed" }
}

function isLowSignal(text) {
  const clean = normalize(text)
  if (!clean) return true
  if (clean.length <= 1) return true
  if (/^(lan|la|hee|he|hm|hmm|ok|tamam|yo|yok|evet|hayır|lol|xd|sa|selam)$/i.test(clean)) return true
  return false
}

function shouldOpenPrivateTalk(text) {
  const lower = (text || "").toLowerCase()
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
    "özel konuşma aç",
    "private room"
  ].some(trigger => lower.includes(trigger))
}

function asksAboutFounder(text) {
  const lower = (text || "").toLowerCase()
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
  const lower = (text || "").toLowerCase()
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
  const lower = (text || "").toLowerCase()
  return [
    "oyun oynayalım",
    "oyun başlat",
    "bir oyun oyna",
    "let's play",
    "play a game",
    "start a game",
    "mini game",
    "bilmece sor",
    "soru sor",
    "trivia"
  ].some(trigger => lower.includes(trigger))
}

function chooseGame(text, language) {
  const lower = (text || "").toLowerCase()
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

function channelIsPrivateForBot(channel) {
  return channel?.type === ChannelType.GuildText && channel.name?.startsWith("private-")
}

function mentionsBotName(text) {
  return normalize(text).includes(normalize(BOT_NAME_LOWER))
}

function isReplyToBot(message) {
  return message.reference?.messageId && message.mentions?.repliedUser?.id === client.user.id
}

function shouldRespondToMessage(message) {
  if (message.mentions.has(client.user)) return true
  if (isReplyToBot(message)) return true
  if (channelIsPrivateForBot(message.channel)) return true

  const content = message.content || ""
  const lower = content.toLowerCase()

  if (mentionsBotName(content)) return true

  const directTriggers = [
    "disogle ",
    "disogle,",
    "disogle?",
    "disogle.",
    "hey disogle",
    "oi disogle",
    "selam disogle",
    "merhaba disogle"
  ]

  return directTriggers.some(trigger => lower.includes(trigger))
}

function isGameControlMessage(text) {
  const lower = normalize(text)
  return [
    "ipucu",
    "hint",
    "gec",
    "geç",
    "pas",
    "pass",
    "skip",
    "soru neydi",
    "question again",
    "repeat",
    "tekrar",
    "bilemedim",
    "i dont know",
    "idk",
    "stop game",
    "oyunu bitir",
    "oyun bitir",
    "bitir",
    "cancel game"
  ].includes(lower)
}

function looksLikeGameAnswer(text) {
  const clean = normalize(text)
  if (!clean) return false
  if (clean.length >= 2 && clean.length <= 24) return true
  if (/^\d+$/.test(clean)) return true
  return false
}

async function createPrivateChannel(message, language) {
  const guild = message.guild
  const member = message.member
  const safeName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)
  const channelName = `private-${safeName || "user"}`

  const existing = guild.channels.cache.find(
    channel => channel.type === ChannelType.GuildText && channel.name === channelName
  )

  if (existing) {
    await message.reply(
      language === "tr"
        ? `Zaten açık bir özel odan var: ${existing}`
        : `You already have an active private room here: ${existing}`
    )
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
    language === "tr"
      ? `Merhaba ${member}, özel odan hazır. Burada daha rahat konuşabiliriz.`
      : `Hey ${member}, your private room is ready. We can talk more freely here.`
  )

  await message.reply(
    language === "tr"
      ? `Özel odan hazır: ${privateChannel}`
      : `Your private room is ready: ${privateChannel}`
  )
}

async function startGame(message, language, gameType) {
  if (gameType === "riddle") {
    const riddle = randomItem(riddles)
    createGame(message.channel.id, {
      type: "riddle",
      language,
      question: language === "tr" ? riddle.questionTR : riddle.questionEN,
      answer: language === "tr" ? riddle.answerTR : riddle.answerEN,
      hint: language === "tr" ? riddle.hintTR : riddle.hintEN
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
      question: trivia.q,
      answer: trivia.a,
      hint: trivia.hint
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
      question: language === "tr" ? "1 ile 10 arasında sayı tuttum." : "I picked a number between 1 and 10.",
      answer: target,
      hint: language === "tr" ? "Küçük düşün." : "Think small."
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

  if (!isGameControlMessage(answer) && !looksLikeGameAnswer(answer)) {
    return false
  }

  if (["ipucu", "hint"].includes(answer)) {
    await message.reply(game.language === "tr" ? `İpucu: ${game.hint}` : `Hint: ${game.hint}`)
    return true
  }

  if (["soru neydi", "question again", "repeat", "tekrar"].includes(answer)) {
    await message.reply(game.question)
    return true
  }

  if (["gec", "geç", "pas", "pass", "skip", "bilemedim", "i dont know", "idk"].includes(answer)) {
    const realAnswer = game.answer
    clearGame(message.channel.id)
    await message.reply(
      game.language === "tr"
        ? `Cevap: ${realAnswer}. İstersen yenisini sorayım.`
        : `The answer was: ${realAnswer}. I can ask another one if you want.`
    )
    return true
  }

  if (["stop game", "oyunu bitir", "oyun bitir", "bitir", "cancel game"].includes(answer)) {
    clearGame(message.channel.id)
    await message.reply(
      game.language === "tr" ? "Tamam, oyunu kapattım." : "Alright, I closed the game."
    )
    return true
  }

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
        ? "Olmadı. Bir daha dene, istersen ipucu da isteyebilirsin."
        : "Not that one. Try again, or ask for a hint."
    )
    return true
  }

  if (game.type === "trivia" || game.type === "riddle") {
    await message.reply(
      game.language === "tr"
        ? "Bu değil. İstersen ipucu yaz ya da geç diyebilirsin."
        : "Not that one. You can ask for a hint or say skip."
    )
    return true
  }

  return false
}

function buildStyleInstruction(language, tone, replyStyle) {
  const langPart = language === "tr" ? "Reply in natural Turkish." : "Reply in natural English."

  const toneMap = {
    excited: "Match excitement only when the user is clearly excited. Do not overact.",
    soft: "Be softer, calmer and reassuring.",
    casual: "Sound natural and lightly witty, not childish.",
    helpful: "Be practical and focused.",
    neutral: "Stay calm, natural and balanced."
  }

  const sizeMap = {
    very_short: "Keep it very short.",
    short: "Keep it short.",
    medium: "Keep it concise but complete.",
    detailed: "Be more detailed, but stay readable."
  }

  return `${langPart} ${toneMap[tone]} ${sizeMap[replyStyle]} Avoid robotic phrasing. Avoid repeating the same sentence patterns. Use light humor only when it fits naturally.`
}

function recentlyRepliedInChannel(channelId) {
  const last = recentChannelReplies.get(channelId)
  if (!last) return false
  return Date.now() - last < 2500
}

function markChannelReply(channelId) {
  recentChannelReplies.set(channelId, Date.now())
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`)
  readyClient.user.setPresence({
    activities: [{ name: "smart conversations", type: ActivityType.Playing }],
    status: "online"
  })
})

client.on(Events.GuildMemberAdd, async member => {
  const welcomeChannel =
    member.guild.channels.cache.find(ch => ch.name === "general" && ch.type === ChannelType.GuildText) ||
    member.guild.systemChannel

  if (!welcomeChannel) return

  try {
    await welcomeChannel.send(`Hoş geldin ${member}. Ben ${BOT_NAME}. Bana soru sorabilir, sohbet edebilir veya özel oda açtırabilirsin.`)
  } catch (error) {
    console.error("WELCOME ERROR:", error)
  }
})

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return
  if (!message.guild) return

  const activeGame = getGame(message.channel.id)
  if (activeGame) {
    const handled = await handleGameReply(message, activeGame)
    if (handled) return
  }

  if (!shouldRespondToMessage(message)) return
  if (recentlyRepliedInChannel(message.channel.id)) return

  if (repliedMessages.has(message.id)) return
  repliedMessages.add(message.id)
  setTimeout(() => repliedMessages.delete(message.id), 15000)

  const cleaned = cleanMention(message.content, client.user.id)
  const question = cleaned || message.content.trim()
  const language = detectLanguage(question)
  const tone = detectTone(question)

  saveUserMessage(message.author.id, message.author.username, question)

  const state = getUserState(message.author.id)
  state.language = language
  state.tone = tone

  if (isOnCooldown(message.author.id)) return
  setCooldown(message.author.id, 1800)

  if (!question) {
    const text = language === "tr" ? "Buradayım." : "I'm here."
    await message.reply(text)
    markChannelReply(message.channel.id)
    return
  }

  if (asksAboutFounder(question)) {
    const text =
      language === "tr"
        ? `Kurucum ${FOUNDER_NAME}.`
        : `My founder is ${FOUNDER_NAME}.`
    await message.reply(text)
    markChannelReply(message.channel.id)
    return
  }

  if (asksWhatAreYou(question)) {
    await message.reply(language === "tr" ? BOT_IDENTITY_TR : BOT_IDENTITY_EN)
    markChannelReply(message.channel.id)
    return
  }

  if (shouldOpenPrivateTalk(question)) {
    try {
      await createPrivateChannel(message, language)
      markChannelReply(message.channel.id)
    } catch (error) {
      console.error("PRIVATE CHANNEL ERROR:", error)
      await message.reply(
        language === "tr"
          ? "Özel oda açarken bir hata oluştu."
          : "I hit an error while creating the private room."
      )
      markChannelReply(message.channel.id)
    }
    return
  }

  if (asksForGame(question)) {
    await startGame(message, language, chooseGame(question, language))
    markChannelReply(message.channel.id)
    return
  }

  if (isLowSignal(question) && !channelIsPrivateForBot(message.channel) && !message.mentions.has(client.user)) {
    return
  }

  const replyProfile = getReplyProfile(question)
  const styleInstruction = buildStyleInstruction(language, tone, replyProfile.style)

  try {
    await message.channel.sendTyping()

    const recentMessages = state.recentMessages.slice(-5).join("\n")
    const recentReplies = state.recentReplies.slice(-3).join("\n")

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content:
            `You are ${Disogle}, a Discord-native AI chatbot created by ${FOUNDER_NAME}. You should feel sharp, natural, concise, and socially aware. You are not a formal assistant. You can chat, explain, brainstorm, joke lightly, answer questions, and help people naturally. Never act desperate for attention. Never reply like a generic support bot. If the user is just talking casually, answer casually. If they insult you lightly, you can respond with calm wit, not aggression. If they seem confused in a game, help them instead of scolding them. If someone asks who founded you, say ${FOUNDER_NAME}. If someone asks what you are, use this identity when relevant: ${language === "tr" ? BOT_IDENTITY_TR : BOT_IDENTITY_EN}. ${styleInstruction}`
        },
        {
          role: "system",
          content: `Recent user messages:\n${recentMessages || "No recent user messages."}`
        },
        {
          role: "system",
          content: `Recent assistant replies:\n${recentReplies || "No recent assistant replies."}`
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.8,
      max_tokens: replyProfile.maxTokens
    })

    const reply =
      response.choices?.[0]?.message?.content?.trim() ||
      (language === "tr" ? "Şu an düzgün bir cevap çıkaramadım." : "I could not form a good reply right now.")

    await message.reply(reply)
    saveAssistantReply(message.author.id, reply)
    markChannelReply(message.channel.id)
  } catch (error) {
    console.error("OPENAI ERROR:", error)
    await message.reply(
      language === "tr"
        ? "Şu an bir hata oluştu. Birazdan tekrar dene."
        : "I ran into an error. Try again in a moment."
    )
    markChannelReply(message.channel.id)
  }
})

client.login(process.env.TOKEN)