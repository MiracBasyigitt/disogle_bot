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

const BOT_NAME = "Disogle"
const FOUNDER_NAME = "Miraç Başyiğit"

const BOT_IDENTITY_TR =
  "Disogle, Miraç Başyiğit tarafından geliştirilen yapay zeka tabanlı bir Discord botudur. Soruları yanıtlayabilir, metin üretebilir, kod yazabilir, özel konuşma odaları açabilir ve topluluk etkileşimini artırabilir."

const BOT_IDENTITY_EN =
  "Disogle is an AI-based Discord bot developed by Miraç Başyiğit. It can answer questions, generate text, write code, open private support rooms, and help keep communities active."

const repliedMessages = new Set()
const userCooldowns = new Map()
const userMemory = new Map()
const activeGames = new Map()
const greetedUsers = new Set()

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
  }
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

const wouldYouRatherTR = [
  "Zihin okuyabilmek mi, görünmez olmak mı?",
  "Hiç uyumamak mı, hiç para derdi çekmemek mi?",
  "Geçmişe gitmek mi, geleceği görmek mi?"
]

const wouldYouRatherEN = [
  "Would you rather read minds or become invisible?",
  "Would you rather never need sleep or never worry about money?",
  "Would you rather travel to the past or see the future?"
]

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
}

function cleanMention(content, botId) {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim()
}

function hasBotNameTrigger(content) {
  return content.toLowerCase().includes(BOT_NAME.toLowerCase())
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

function getUserState(userId) {
  if (!userMemory.has(userId)) {
    userMemory.set(userId, {
      languageMode: "auto",
      lastDetectedLanguage: "tr",
      tone: "neutral",
      recentMessages: []
    })
  }
  return userMemory.get(userId)
}

function saveUserMessage(userId, content) {
  const state = getUserState(userId)
  state.recentMessages.push(content)
  if (state.recentMessages.length > 6) state.recentMessages.shift()
}

function detectLanguage(text) {
  const lower = text.toLowerCase()
  const trHints = ["merhaba", "selam", "neden", "nasıl", "kurucun", "özel", "konuş", "yapar", "senin", "türkçe", "bilemedim", "ipucu", "cevap"]
  const enHints = ["hello", "what", "why", "how", "founder", "private", "talk", "write", "code", "english", "hint", "skip", "answer"]

  const trScore = trHints.filter(h => lower.includes(h)).length
  const enScore = enHints.filter(h => lower.includes(h)).length

  if (trScore > enScore) return "tr"
  if (enScore > trScore) return "en"
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return "tr"
  return "en"
}

function resolveLanguage(userId, text) {
  const state = getUserState(userId)

  if (state.languageMode === "tr") return "tr"
  if (state.languageMode === "en") return "en"

  const detected = detectLanguage(text)
  state.lastDetectedLanguage = detected
  return detected
}

function detectTone(text) {
  const lower = text.toLowerCase()

  if (lower.includes("üzgün") || lower.includes("kötü") || lower.includes("berbat") || lower.includes("sad")) return "soft"
  if (lower.includes("haha") || lower.includes("jsjs") || lower.includes("lol") || lower.includes("gül") || lower.includes("lan")) return "casual"
  if (/[!?]{2,}/.test(text) || lower.includes("wow") || lower.includes("inanılmaz")) return "excited"
  if (lower.includes("yardım") || lower.includes("help")) return "helpful"

  return "neutral"
}

function getReplyProfile(text) {
  const len = text.trim().length
  if (len <= 8) return { maxTokens: 40, style: "very_short" }
  if (len <= 20) return { maxTokens: 70, style: "short" }
  if (len <= 70) return { maxTokens: 140, style: "medium" }
  return { maxTokens: 240, style: "detailed" }
}

function isLowSignal(text) {
  const clean = normalize(text)
  if (!clean) return true
  if (clean.length <= 2) return true
  if (/^(lan|la|hee|he|hm|hmm|ok|tamam|yo|yok|evet|hayır|xd|lol)$/i.test(clean)) return true
  return false
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

function asksForGame(text) {
  const lower = text.toLowerCase()
  return [
    "oyun oynayalım",
    "oyun başlat",
    "bir oyun oyna",
    "lets play",
    "let's play",
    "play a game",
    "start a game",
    "mini game",
    "bilmece sor",
    "trivia sor"
  ].some(trigger => lower.includes(trigger))
}

function chooseGame(text, language) {
  const lower = text.toLowerCase()

  if (lower.includes("bilmece") || lower.includes("riddle")) return "riddle"
  if (lower.includes("trivia")) return "trivia"
  if (lower.includes("sayı") || lower.includes("number")) return "number"
  if (lower.includes("would you rather") || lower.includes("hangisini seçerdin")) return "wyr"

  return language === "tr" ? "riddle" : "riddle"
}

function detectLanguageCommand(text) {
  const lower = text.toLowerCase()

  if (
    lower.includes("türkçe konuş") ||
    lower.includes("turkce konus") ||
    lower.includes("speak turkish") ||
    lower.includes("talk in turkish") ||
    lower.includes("reply in turkish")
  ) {
    return "tr"
  }

  if (
    lower.includes("ingilizce konuş") ||
    lower.includes("ingilizce konus") ||
    lower.includes("english konuş") ||
    lower.includes("speak english") ||
    lower.includes("talk in english") ||
    lower.includes("reply in english")
  ) {
    return "en"
  }

  if (
    lower.includes("türkçe konuşmayı bırak") ||
    lower.includes("ingilizce konuşmayı bırak") ||
    lower.includes("normal konuş") ||
    lower.includes("otomatik konuş") ||
    lower.includes("auto language") ||
    lower.includes("automatic language") ||
    lower.includes("return to auto language")
  ) {
    return "auto"
  }

  return null
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

function getGameControlIntent(text) {
  const lower = text.toLowerCase()

  if (
    ["ipucu", "hint", "bir ipucu", "1 harf", "bir harf daha", "1 harf daha", "harf ver"].some(x => lower.includes(x))
  ) return "hint"

  if (
    ["bilemedim", "cevap ne", "cevabı söyle", "cevabi soyle", "cevabı söyler misin", "answer", "what was it", "tell me the answer"].some(x => lower.includes(x))
  ) return "answer"

  if (
    ["geç", "pas", "skip", "next"].some(x => lower.includes(x))
  ) return "skip"

  if (
    ["oyunu kapat", "oyun bitsin", "oyunu bitir", "dur", "stop game", "stop", "end game"].some(x => lower.includes(x))
  ) return "stop"

  return null
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
      ? `Merhaba ${member}, özel konuşma odan hazır. Hazırsan yaz, ben buradayım.\n\nKurucum ${FOUNDER_NAME}.`
      : `Hey ${member}, your private room is ready. Send a message whenever you're ready.\n\nMy founder is ${FOUNDER_NAME}.`
  )

  await message.reply(
    language === "tr"
      ? `Özel odan hazır: ${privateChannel}`
      : `Your private session is ready: ${privateChannel}`
  )
}

async function startGame(message, language, gameType) {
  if (gameType === "riddle") {
    const riddle = randomItem(riddles)
    createGame(message.channel.id, {
      type: "riddle",
      language,
      answer: language === "tr" ? riddle.answerTR : riddle.answerEN
    })

    await message.reply(
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

    await message.reply(
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

    await message.reply(
      language === "tr"
        ? "1 ile 10 arasında bir sayı tuttum. Tahmin et. İstersen geçebilir ya da cevabı sorabilirsin."
        : "I picked a number between 1 and 10. Guess it. You can skip or ask for the answer."
    )
    return
  }

  if (gameType === "wyr") {
    const q = language === "tr" ? randomItem(wouldYouRatherTR) : randomItem(wouldYouRatherEN)
    await message.reply(q)
  }
}

function getHint(game) {
  const a = String(game.answer)
  if (a.length <= 1) return a

  if (a.length === 2) return `${a[0]}_`
  if (a.length === 3) return `${a[0]}${a[1]}_`

  return `${a.slice(0, 2)}${"_".repeat(a.length - 2)}`
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
    await message.reply(
      language === "tr"
        ? `İpucu: ${getHint(game)}`
        : `Hint: ${getHint(game)}`
    )
    return "handled"
  }

  if (control === "answer") {
    const answerText =
      language === "tr"
        ? `Cevap: ${game.answer}. İstersen yeni bir oyun başlatabiliriz.`
        : `The answer was: ${game.answer}. We can start a new game if you want.`

    clearGame(message.channel.id)
    await message.reply(answerText)
    return "handled"
  }

  if (control === "skip") {
    clearGame(message.channel.id)
    await message.reply(
      language === "tr"
        ? "Tamam, bunu geçiyorum. İstersen yeni bir oyun başlatabiliriz."
        : "Alright, skipping this one. We can start a new game if you want."
    )
    return "handled"
  }

  if (control === "stop") {
    clearGame(message.channel.id)
    await message.reply(
      language === "tr"
        ? "Tamam, oyunu kapattım."
        : "Alright, I ended the game."
    )
    return "handled"
  }

  const answer = normalize(content)

  if (answer === normalize(game.answer)) {
    clearGame(message.channel.id)
    await message.reply(
      language === "tr"
        ? "Doğru bildin. Güzel oynadın."
        : "Correct. Nice one."
    )
    return "handled"
  }

  if (game.type === "number" && /^\d+$/.test(answer)) {
    await message.reply(
      language === "tr"
        ? "Olmadı. Bir daha dene, ya da geç diyebilirsin."
        : "Not that one. Try again, or say skip."
    )
    return "handled"
  }

  if (game.type === "trivia" || game.type === "riddle") {
    if (answer.length > 0) {
      await message.reply(
        language === "tr"
          ? "Henüz doğru değil. İstersen ipucu al, geç ya da cevabı sor."
          : "Not correct yet. You can ask for a hint, skip, or ask for the answer."
      )
      return "handled"
    }
  }

  return "handled"
}

function buildStyleInstruction(language, tone, replyStyle) {
  const langPart =
    language === "tr"
      ? "Reply in natural Turkish."
      : "Reply in natural English."

  const toneMap = {
    excited: "Match excitement only if it is truly present. Do not overact.",
    soft: "Be softer and calmer.",
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

  return `${langPart} ${toneMap[tone]} ${sizeMap[replyStyle]} Use emojis only when they fit naturally. Do not keep asking what else the user wants after every reply. Only do that when it genuinely fits.`
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

  const hasTrigger = shouldRespond(message)
  const activeGame = getGame(message.channel.id)

  if (activeGame && hasTrigger) {
    const result = await handleGameMessage(message, activeGame)

    if (result === "handoff_private") {
      const language = resolveLanguage(message.author.id, message.content)
      await createPrivateChannel(message, language)
      return
    }

    if (result === "handoff_founder") {
      const language = resolveLanguage(message.author.id, message.content)
      await message.reply(
        language === "tr"
          ? `Benim kurucum ${FOUNDER_NAME}.`
          : `My founder is ${FOUNDER_NAME}.`
      )
      return
    }

    if (result === "handoff_identity") {
      const language = resolveLanguage(message.author.id, message.content)
      await message.reply(language === "tr" ? BOT_IDENTITY_TR : BOT_IDENTITY_EN)
      return
    }

    if (result === "handoff_new_game") {
      const language = resolveLanguage(message.author.id, message.content)
      const gameType = chooseGame(message.content, language)
      await startGame(message, language, gameType)
      return
    }

    if (result === "handoff_language") {
      const mode = detectLanguageCommand(message.content)
      const state = getUserState(message.author.id)
      state.languageMode = mode

      if (mode === "tr") {
        await message.reply("Tamam, Türkçe devam edeceğim.")
      } else if (mode === "en") {
        await message.reply("Alright, I will continue in English.")
      } else {
        await message.reply("Tamam, tekrar otomatik dil algısına döndüm.")
      }
      return
    }

    if (result === "handled") return
  }

  if (!hasTrigger) return

  if (repliedMessages.has(message.id)) return
  repliedMessages.add(message.id)
  setTimeout(() => repliedMessages.delete(message.id), 15000)

  if (isOnCooldown(message.author.id)) return
  setCooldown(message.author.id, 1800)

  let question = message.content
  if (message.mentions.has(client.user)) {
    question = cleanMention(question, client.user.id)
  }

  question = question.replace(new RegExp(BOT_NAME, "ig"), "").trim()
  if (!question) question = message.content.trim()

  const state = getUserState(message.author.id)
  const langMode = detectLanguageCommand(question)

  if (langMode) {
    state.languageMode = langMode

    if (langMode === "tr") {
      await message.reply("Tamam, Türkçe konuşacağım.")
    } else if (langMode === "en") {
      await message.reply("Alright, I will speak English.")
    } else {
      await message.reply("Tamam, yeniden otomatik dil algısına döndüm.")
    }
    return
  }

  const language = resolveLanguage(message.author.id, question)
  const tone = detectTone(question)
  const replyProfile = getReplyProfile(question)

  state.tone = tone
  saveUserMessage(message.author.id, question)

  if (asksAboutFounder(question)) {
    await message.reply(
      language === "tr"
        ? `Benim kurucum ${FOUNDER_NAME}.`
        : `My founder is ${FOUNDER_NAME}.`
    )
    return
  }

  if (asksWhatAreYou(question)) {
    await message.reply(language === "tr" ? BOT_IDENTITY_TR : BOT_IDENTITY_EN)
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
    await message.reply(
      language === "tr"
        ? "Daha net yazarsan daha iyi yardımcı olabilirim."
        : "If you say it a bit more clearly, I can help better."
    )
    return
  }

  try {
    await message.channel.sendTyping()

    const recent = state.recentMessages.slice(-4).join("\n")
    const styleInstruction = buildStyleInstruction(language, tone, replyProfile.style)
    const firstTime = !greetedUsers.has(message.author.id)

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `You are ${BOT_NAME}, a smart conversational Discord AI developed by ${FOUNDER_NAME}. You can answer questions, write code, generate text, brainstorm ideas, help with decisions, and keep communities active. You may use humor, but keep it sharp and natural, not clownish. Do not behave overly cheerful by default. Emotion should be adaptive, not forced. If asked who you are, you may say: "${BOT_IDENTITY_EN}" If asked about your founder, say your founder is ${FOUNDER_NAME}. If the user wants a private talk, say you can open a private room. Respect the user's current language mode. ${styleInstruction}`
        },
        {
          role: "system",
          content:
            `Recent context from this same user:\n${recent || "No recent context."}\n\nThis is ${firstTime ? "the first meaningful interaction with this user today" : "not the first interaction with this user today"}. If it is the first one, a brief natural greeting is okay. Otherwise, answer directly without repetitive greeting lines.`
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.72,
      max_tokens: replyProfile.maxTokens
    })

    const reply =
      response.choices?.[0]?.message?.content?.trim() ||
      (language === "tr"
        ? "Şu an uygun bir cevap üretemedim."
        : "I couldn't generate a response right now.")

    greetedUsers.add(message.author.id)
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