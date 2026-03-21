const { normalize } = require("./language")

function parseDurationMs(text) {
  const value = normalize(text)

  const minute = value.match(/(\d+)\s*(dakika|dk|minute|min)/)
  if (minute) return Number(minute[1]) * 60 * 1000

  const hour = value.match(/(\d+)\s*(saat|hour|hr)/)
  if (hour) return Number(hour[1]) * 60 * 60 * 1000

  const day = value.match(/(\d+)\s*(gun|gün|day)/)
  if (day) return Number(day[1]) * 24 * 60 * 60 * 1000

  return null
}

function extractQuoted(text) {
  return [...String(text || "").matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)]
    .map(x => (x[1] || x[2] || x[3] || "").trim())
    .filter(Boolean)
}

function cleanName(text) {
  return String(text || "")
    .replace(/\b(olsun|olacak|yap|aç|ac|oluştur|olustur|create|make|inside|under|ve|and|the)\b/gi, " ")
    .replace(/\b(kategori|category|kanal|channel|sesli|voice|text|metin|room|oda)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function slugify(text) {
  return normalize(text)
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90)
}

function detectModerationPlan(message, text, language) {
  const value = normalize(text)
  const target = message.mentions.members?.first()

  if (!target) {
    return {
      isModerationRequest: false
    }
  }

  const isBan =
    value.includes("banla") ||
    value.startsWith("ban ") ||
    value.includes(" yasakla") ||
    value.includes(" ban ")

  const isKick =
    value.includes("kick") ||
    value.includes("sunucudan at") ||
    value.includes("cikar") ||
    value.includes("çıkar")

  const isUnmute =
    value.includes("unmute") ||
    value.includes("mute kaldir") ||
    value.includes("muteyi kaldir") ||
    value.includes("timeout kaldir")

  const isMute =
    !isUnmute &&
    (
      value.includes("mute") ||
      value.includes("sustur") ||
      value.includes("sustur ") ||
      value.includes("timeout")
    )

  const isWarn =
    value.includes("warn") ||
    value.includes("uyar")

  if (!isBan && !isKick && !isMute && !isUnmute && !isWarn) {
    return {
      isModerationRequest: false
    }
  }

  let action = null
  if (isBan) action = "ban"
  else if (isKick) action = "kick"
  else if (isUnmute) action = "unmute"
  else if (isMute) action = "mute"
  else if (isWarn) action = "warn"

  return {
    isModerationRequest: true,
    action,
    targetId: target.id,
    durationMs: action === "mute" ? parseDurationMs(text) || 15 * 60 * 1000 : null,
    reason: language === "tr" ? "Disogle moderasyon işlemi" : "Disogle moderation action"
  }
}

function detectPurgePlan(message, text) {
  const value = normalize(text)
  const match =
    value.match(/(\d+)\s*(mesaj|message)\s*(sil|delete|temizle|purge)/) ||
    value.match(/(sil|delete|temizle|purge)\s*(\d+)\s*(mesaj|message)?/)

  if (!match) {
    return {
      isPurgeRequest: false
    }
  }

  const number = Number(match.find(x => /^\d+$/.test(String(x || ""))))
  if (!Number.isFinite(number)) {
    return {
      isPurgeRequest: false
    }
  }

  return {
    isPurgeRequest: true,
    amount: Math.max(1, Math.min(100, number))
  }
}

function detectAnalyticsIntent(text) {
  const value = normalize(text)

  return (
    value.includes("analytics") ||
    value.includes("server stats") ||
    value.includes("sunucu istatistik") ||
    value.includes("sunucu analizi") ||
    value.includes("server analysis")
  )
}

function detectBuilderIntent(text) {
  const value = normalize(text)

  return (
    value.includes("sunucu kur") ||
    value.includes("bu sunucuya kur") ||
    value.includes("bu sistemi kur") ||
    value.includes("build this server") ||
    value.includes("setup this server") ||
    value.includes("setup the server") ||
    value.includes("build the server") ||
    value.includes("create the full server") ||
    value.includes("topluluk kur") ||
    value.includes("community setup")
  )
}

function detectBuilderPlan(text, language) {
  const value = normalize(text)

  if (!detectBuilderIntent(text)) {
    return {
      isBuilderRequest: false
    }
  }

  const wantsRoles =
    value.includes("rollerle") ||
    value.includes("with roles") ||
    value.includes("roles too") ||
    value.includes("roles included")

  const wantsEnglish =
    value.includes("english") ||
    value.includes("ingilizce")

  const finalLanguage = wantsEnglish ? "en" : language

  return {
    isBuilderRequest: true,
    language: finalLanguage,
    includeRoles: wantsRoles
  }
}

function detectVoicePlan(text, language) {
  const value = normalize(text)
  const quoted = extractQuoted(text)

  const wantsJoin =
    value.includes("voice gel") ||
    value.includes("ses gel") ||
    value.includes("come to voice") ||
    value.includes("join voice") ||
    value.includes("join the voice") ||
    value.includes("katil sesliye") ||
    value.includes("sesliye gel")

  const wantsLeave =
    value.includes("voice cik") ||
    value.includes("voice çık") ||
    value.includes("leave voice") ||
    value.includes("disconnect") ||
    value.includes("sesten cik") ||
    value.includes("sesten çık")

  if (!wantsJoin && !wantsLeave) {
    return {
      isVoiceRequest: false
    }
  }

  if (wantsLeave) {
    return {
      isVoiceRequest: true,
      action: "leave",
      channelName: null
    }
  }

  let channelName = null

  if (quoted.length) {
    channelName = quoted[0]
  } else {
    const patterns = [
      /(.+?)\s+(ses|voice)\s+gel/,
      /(.+?)\s+voice\s+join/,
      /join\s+(.+?)\s+voice/,
      /(.+?)\s+sesliye\s+gel/,
      /go\s+to\s+(.+?)$/
    ]

    for (const pattern of patterns) {
      const match = value.match(pattern)
      if (match?.[1]) {
        channelName = cleanName(match[1])
        break
      }
    }
  }

  return {
    isVoiceRequest: true,
    action: "join",
    channelName: channelName || null
  }
}

function manualManagement(text, language) {
  const value = normalize(text)
  const quoted = extractQuoted(text)
  const operations = []

  const categoryCreate =
    value.match(/(.+?)\s+adinda\s+kategori\s+olustur/) ||
    value.match(/(.+?)\s+isminde\s+kategori\s+olustur/) ||
    value.match(/create\s+(?:a\s+)?category\s+(?:named\s+)?(.+)/)

  if (categoryCreate?.[1]) {
    const categoryName = cleanName(categoryCreate[1])
    if (categoryName) {
      operations.push({
        type: "create_category",
        categoryName
      })
    }
  }

  const categoryDelete =
    value.match(/(.+?)\s+kategorisini\s+sil/) ||
    value.match(/delete\s+category\s+(.+)/)

  if (categoryDelete?.[1]) {
    operations.push({
      type: "delete_category",
      categoryName: cleanName(categoryDelete[1])
    })
  }

  const categoryRename =
    value.match(/(.+?)\s+kategorisinin\s+adini\s+(.+?)\s+yap/) ||
    value.match(/rename\s+category\s+(.+?)\s+to\s+(.+)/)

  if (categoryRename?.[1] && categoryRename?.[2]) {
    operations.push({
      type: "rename_category",
      categoryName: cleanName(categoryRename[1]),
      newCategoryName: cleanName(categoryRename[2])
    })
  }

  const wantsVoice = value.includes("sesli") || value.includes("voice")

  const createChannelInCategory =
    value.match(/(.+?)\s+kategorisine\s+kanal\s+olustur/) ||
    value.match(/(.+?)\s+kategorisinde\s+kanal\s+olustur/) ||
    value.match(/create\s+channel\s+under\s+(.+)/)

  if (createChannelInCategory?.[1] && quoted.length) {
    for (const name of quoted) {
      operations.push({
        type: "create_channel",
        categoryName: cleanName(createChannelInCategory[1]),
        channelName: name,
        channelType: wantsVoice ? "voice" : "text"
      })
    }
  }

  const directVoice =
    value.match(/(.+?)\s+kategorisine\s+sesli\s+kanal\s+ac/) ||
    value.match(/(.+?)\s+kategorisinde\s+sesli\s+kanal\s+ac/) ||
    value.match(/create\s+voice\s+channel\s+under\s+(.+)/)

  if (directVoice?.[1]) {
    const channelName = quoted[0] || (language === "tr" ? "sesli-sohbet" : "voice-chat")
    operations.push({
      type: "create_channel",
      categoryName: cleanName(directVoice[1]),
      channelName,
      channelType: "voice"
    })
  }

  const directText =
    value.match(/(.+?)\s+kategorisine\s+metin\s+kanali\s+ac/) ||
    value.match(/(.+?)\s+kategorisine\s+yazi\s+kanali\s+ac/) ||
    value.match(/create\s+text\s+channel\s+under\s+(.+)/)

  if (directText?.[1]) {
    const channelName = quoted[0] || (language === "tr" ? "genel" : "general")
    operations.push({
      type: "create_channel",
      categoryName: cleanName(directText[1]),
      channelName,
      channelType: "text"
    })
  }

  const deleteChannel =
    value.match(/(.+?)\s+kanalini\s+sil/) ||
    value.match(/delete\s+channel\s+(.+)/)

  if (deleteChannel?.[1]) {
    operations.push({
      type: "delete_channel",
      channelName: cleanName(deleteChannel[1])
    })
  }

  const renameChannel =
    value.match(/(.+?)\s+kanalinin\s+adini\s+(.+?)\s+yap/) ||
    value.match(/rename\s+channel\s+(.+?)\s+to\s+(.+)/)

  if (renameChannel?.[1] && renameChannel?.[2]) {
    operations.push({
      type: "rename_channel",
      channelName: cleanName(renameChannel[1]),
      newChannelName: cleanName(renameChannel[2])
    })
  }

  const moveChannel =
    value.match(/(.+?)\s+kanalini\s+(.+?)\s+kategorisine\s+tasi/) ||
    value.match(/move\s+channel\s+(.+?)\s+to\s+(.+)/)

  if (moveChannel?.[1] && moveChannel?.[2]) {
    operations.push({
      type: "move_channel",
      channelName: cleanName(moveChannel[1]),
      targetCategoryName: cleanName(moveChannel[2])
    })
  }

  const setTopic =
    value.match(/(.+?)\s+kanalinin\s+aciklamasini\s+(.+?)\s+yap/) ||
    value.match(/change\s+topic\s+of\s+(.+?)\s+to\s+(.+)/)

  if (setTopic?.[1] && setTopic?.[2]) {
    operations.push({
      type: "set_channel_topic",
      channelName: cleanName(setTopic[1]),
      topic: String(setTopic[2]).trim()
    })
  }

  if (
    value.includes("tum kanal ve kategorileri sil") ||
    value.includes("tüm kanal ve kategorileri sil") ||
    value.includes("delete all channels and categories") ||
    value.includes("delete all categories and channels")
  ) {
    operations.push({
      type: "delete_all_structure"
    })
  }

  if (operations.length) {
    return {
      isManagementRequest: true,
      operations
    }
  }

  return {
    isManagementRequest: false,
    operations: []
  }
}

async function aiManagement(openai, model, text, language) {
  const schema = {
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
                "move_channel",
                "set_channel_topic",
                "delete_all_structure"
              ]
            },
            categoryName: { type: ["string", "null"] },
            newCategoryName: { type: ["string", "null"] },
            channelName: { type: ["string", "null"] },
            newChannelName: { type: ["string", "null"] },
            channelType: { type: ["string", "null"], enum: ["text", "voice", null] },
            targetCategoryName: { type: ["string", "null"] },
            topic: { type: ["string", "null"] }
          },
          required: [
            "type",
            "categoryName",
            "newCategoryName",
            "channelName",
            "newChannelName",
            "channelType",
            "targetCategoryName",
            "topic"
          ]
        }
      }
    },
    required: ["isManagementRequest", "operations"]
  }

  const response = await openai.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You parse Discord server management commands in Turkish and English.",
              "Return only valid JSON.",
              "Prefer execution intent, not suggestion intent.",
              "Understand deleting all channels/categories, creating full layouts, moving channels, renaming, topics, text/voice channels."
            ].join(" ")
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `language=${language}\nmessage=${text}`
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "discord_management_plan",
        schema
      }
    }
  })

  const parsed = JSON.parse(String(response.output_text || "{}"))

  if (!parsed || !Array.isArray(parsed.operations)) {
    return {
      isManagementRequest: false,
      operations: []
    }
  }

  return parsed
}

async function detectManagementPlan(openai, model, guild, member, text, language) {
  const manual = manualManagement(text, language)
  if (manual.isManagementRequest) return manual

  const value = normalize(text)
  const signalWords = [
    "kategori",
    "kanal",
    "channel",
    "category",
    "olustur",
    "sil",
    "delete",
    "rename",
    "tasi",
    "move",
    "topic",
    "aciklama",
    "voice",
    "sesli",
    "structure"
  ]

  const looksLikeManagement = signalWords.some(x => value.includes(x))

  if (!looksLikeManagement) {
    return {
      isManagementRequest: false,
      operations: []
    }
  }

  try {
    return await aiManagement(openai, model, text, language)
  } catch {
    return {
      isManagementRequest: false,
      operations: []
    }
  }
}

module.exports = {
  parseDurationMs,
  extractQuoted,
  cleanName,
  slugify,
  detectModerationPlan,
  detectPurgePlan,
  detectManagementPlan,
  detectAnalyticsIntent,
  detectBuilderIntent,
  detectBuilderPlan,
  detectVoicePlan
}