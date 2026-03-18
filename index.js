require("dotenv").config()

const {
  Client,
  GatewayIntentBits,
  Events,
  ActivityType,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  OverwriteType
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
  "Disogle, Miraç Başyiğit tarafından geliştirilen yapay zeka tabanlı bir Discord botudur. Soruları yanıtlayabilir, metin üretebilir, kod yazabilir ve sunucu yapısını yönetebilir."

const BOT_IDENTITY_EN =
  "Disogle is an AI-based Discord bot developed by Miraç Başyiğit. It can answer questions, generate text, write code, and manage server structure."

const repliedMessages = new Set()
const userCooldowns = new Map()
const userMemory = new Map()
const greetedUsers = new Set()

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90)
}

function cleanMention(content, botId) {
  return String(content || "").replace(new RegExp(`<@!?${botId}>`, "g"), "").trim()
}

function hasBotNameTrigger(content) {
  return String(content || "").toLowerCase().includes(BOT_NAME.toLowerCase())
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
  const lower = String(text || "").toLowerCase()
  const trHints = ["merhaba", "selam", "neden", "nasıl", "kurucun", "özel", "konuş", "türkçe", "kanal", "kategori", "sil", "değiştir", "oluştur"]
  const enHints = ["hello", "what", "why", "how", "founder", "private", "talk", "english", "channel", "category", "delete", "rename", "create"]

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
  const lower = String(text || "").toLowerCase()

  if (lower.includes("üzgün") || lower.includes("kötü") || lower.includes("berbat") || lower.includes("sad")) return "soft"
  if (lower.includes("haha") || lower.includes("jsjs") || lower.includes("lol") || lower.includes("lan")) return "casual"
  if (/[!?]{2,}/.test(text) || lower.includes("wow") || lower.includes("inanılmaz")) return "excited"
  if (lower.includes("yardım") || lower.includes("help")) return "helpful"

  return "neutral"
}

function getReplyProfile(text) {
  const len = String(text || "").trim().length
  if (len <= 8) return { maxTokens: 40, style: "very_short" }
  if (len <= 20) return { maxTokens: 70, style: "short" }
  if (len <= 70) return { maxTokens: 140, style: "medium" }
  return { maxTokens: 260, style: "detailed" }
}

function isLowSignal(text) {
  const clean = normalize(text)
  if (!clean) return true
  if (clean.length <= 2) return true
  if (/^(lan|la|hee|he|hm|hmm|ok|tamam|yo|yok|evet|hayır|xd|lol)$/i.test(clean)) return true
  return false
}

function asksAboutFounder(text) {
  const lower = String(text || "").toLowerCase()
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
  const lower = String(text || "").toLowerCase()
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

function detectLanguageCommand(text) {
  const lower = String(text || "").toLowerCase()

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

  return `${langPart} ${toneMap[tone]} ${sizeMap[replyStyle]} Use emojis only when they fit naturally.`
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

function toDiscordChannelType(type) {
  const t = String(type || "").toLowerCase()
  if (t === "voice" || t === "ses") return ChannelType.GuildVoice
  if (t === "forum") return ChannelType.GuildForum
  return ChannelType.GuildText
}

function hasAdminAccess(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator)
}

function botCanManage(guild) {
  const me = guild.members.me
  if (!me) return false
  return me.permissions.has(PermissionFlagsBits.ManageChannels)
}

function getRoleByName(guild, roleName) {
  const target = normalize(roleName).replace(/^@/, "")
  return guild.roles.cache.find(r => normalize(r.name) === target)
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

function findCategoryByName(guild, name) {
  const target = normalize(name)
  return guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && normalize(c.name) === target
  )
}

function findAnyChannelByName(guild, name) {
  const target = normalize(name)
  return guild.channels.cache.find(
    c => c.type !== ChannelType.GuildCategory && normalize(c.name) === target
  )
}

function findChannelInCategoryByName(guild, categoryName, channelName) {
  const category = findCategoryByName(guild, categoryName)
  if (!category) return null
  const target = normalize(channelName)

  return guild.channels.cache.find(
    c =>
      c.parentId === category.id &&
      c.type !== ChannelType.GuildCategory &&
      normalize(c.name) === target
  )
}

function uniqueChannelName(guild, parentId, desiredName, type) {
  const base = slugify(desiredName) || "kanal"
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
  const lower = String(name || "").toLowerCase()

  if (lower.includes("core") || lower.includes("ana")) {
    return language === "tr"
      ? [
          { name: "genel", type: "text", topic: "Genel sohbet ve ana konuşmalar." },
          { name: "duyurular", type: "text", topic: "Önemli sunucu duyuruları." },
          { name: "kurallar", type: "text", topic: "Sunucu kuralları ve rehberler." },
          { name: "destek", type: "text", topic: "Yardım ve destek talepleri." },
          { name: "sohbet", type: "voice" }
        ]
      : [
          { name: "general", type: "text", topic: "Main conversations and community chat." },
          { name: "announcements", type: "text", topic: "Important server announcements." },
          { name: "rules", type: "text", topic: "Server rules and guidance." },
          { name: "support", type: "text", topic: "Help and support requests." },
          { name: "voice-chat", type: "voice" }
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
        { name: "sharing", type: "text", topic: `Sharing space for ${name}.` },
        { name: "voice-chat", type: "voice" }
      ]
}

async function detectManagementPlan(question, language) {
  const prompt = `
You are a Discord server management intent parser.
Return ONLY valid JSON.

Schema:
{
  "isManagementRequest": boolean,
  "operations": [
    {
      "type": "create_category" | "delete_category" | "rename_category" | "create_channel" | "delete_channel" | "rename_channel" | "set_channel_topic" | "move_channel" | "rename_all_channels_in_category" | "set_all_channel_topics_in_category",
      "categoryName": string | null,
      "newCategoryName": string | null,
      "channelName": string | null,
      "newChannelName": string | null,
      "channelType": "text" | "voice" | null,
      "topic": string | null,
      "targetCategoryName": string | null,
      "baseName": string | null,
      "applySensibleDefaults": boolean,
      "permissions": [
        {
          "subject": "everyone" | "requester" | string,
          "allow": string[],
          "deny": string[]
        }
      ]
    }
  ]
}

Rules:
- If the user asks to create a category and "make sensible channels", use applySensibleDefaults true.
- If the user explicitly names channels, create separate create_channel operations.
- If the user asks to rename all channels in a category to one name, use rename_all_channels_in_category with baseName.
- If the user asks to change explanations/descriptions for channels in a category, use set_all_channel_topics_in_category with topic.
- If unrelated to management, return isManagementRequest false and operations [].
- Use Discord.js PermissionFlagsBits names only.
- Keep operations minimal and precise.
- Return JSON only.

User message:
${question}

Language:
${language}
`

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.15,
    max_tokens: 500,
    messages: [
      { role: "system", content: "Return only valid JSON." },
      { role: "user", content: prompt }
    ]
  })

  const content = response.choices?.[0]?.message?.content?.trim() || ""
  const parsed = safeJsonParse(content)

  if (!parsed || !Array.isArray(parsed.operations)) {
    return { isManagementRequest: false, operations: [] }
  }

  return parsed
}

async function executeManagementPlan(message, plan, language) {
  const guild = message.guild
  const member = message.member

  if (!hasAdminAccess(member)) {
    await message.reply(
      language === "tr"
        ? "Bunu sadece yönetici yetkisi olan biri kullanabilir."
        : "Only someone with administrator permission can use that."
    )
    return true
  }

  if (!botCanManage(guild)) {
    await message.reply(
      language === "tr"
        ? "Bunu yapabilmem için bende Manage Channels yetkisi olmalı."
        : "I need Manage Channels permission to do that."
    )
    return true
  }

  const results = []

  for (const op of plan.operations) {
    try {
      if (op.type === "create_category") {
        const rawName = op.categoryName || (language === "tr" ? "Yeni Kategori" : "New Category")
        const existing = findCategoryByName(guild, rawName)
        let category = existing

        if (!category) {
          const permissionOverwrites = buildPermissionOverwrites(guild, op.permissions, member.id)
          category = await guild.channels.create({
            name: slugify(rawName),
            type: ChannelType.GuildCategory,
            permissionOverwrites: permissionOverwrites.length ? permissionOverwrites : undefined
          })
          results.push(language === "tr" ? `Kategori oluşturuldu: ${category}` : `Created category: ${category.name}`)
        } else {
          results.push(language === "tr" ? `Kategori zaten vardı: ${existing}` : `Category already existed: ${existing.name}`)
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

            results.push(language === "tr" ? `Kanal oluşturuldu: ${createdChannel}` : `Created channel: ${createdChannel.name}`)
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
          results.push(language === "tr" ? `Kategori adı değiştirildi: ${category}` : `Renamed category to: ${newName}`)
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
            results.push(language === "tr" ? `Kategori oluşturuldu: ${category}` : `Created category: ${category.name}`)
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

        results.push(language === "tr" ? `Kanal oluşturuldu: ${created}` : `Created channel: ${created.name}`)
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
          results.push(language === "tr" ? `Kanal adı değiştirildi: #${newName}` : `Renamed channel to: ${newName}`)
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
        } else if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildForum) {
          results.push(language === "tr" ? `Açıklama sadece yazı kanallarında değiştirilebilir: ${channel.name}` : `Topic can only be changed on text-based channels: ${channel.name}`)
        } else {
          await channel.setTopic(op.topic || "")
          results.push(language === "tr" ? `Kanal açıklaması değiştirildi: #${channel.name}` : `Updated topic for: ${channel.name}`)
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
            results.push(language === "tr" ? `Hedef kategori oluşturuldu: ${targetCategory}` : `Created target category: ${targetCategory.name}`)
          }

          await channel.setParent(targetCategory.id)
          results.push(language === "tr" ? `Kanal taşındı: #${channel.name} -> ${targetCategory}` : `Moved channel ${channel.name} to ${targetCategory.name}`)
        }
      }

      if (op.type === "rename_all_channels_in_category") {
        const category = findCategoryByName(guild, op.categoryName)
        if (!category) {
          results.push(language === "tr" ? `Kategori bulunamadı: ${op.categoryName}` : `Category not found: ${op.categoryName}`)
        } else {
          const children = guild.channels.cache
            .filter(c => c.parentId === category.id && c.type !== ChannelType.GuildCategory)
            .sort((a, b) => a.rawPosition - b.rawPosition)

          if (!children.size) {
            results.push(language === "tr" ? `Kategoride kanal yok: ${category.name}` : `No channels in category: ${category.name}`)
          } else {
            let index = 1
            for (const [, ch] of children) {
              const base = slugify(op.baseName || "kanal")
              const nextName = index === 1 ? base : `${base}-${index}`
              await ch.setName(nextName)
              index++
            }
            results.push(language === "tr" ? `Kategorideki tüm kanallar yeniden adlandırıldı: ${category}` : `Renamed all channels in category: ${category.name}`)
          }
        }
      }

      if (op.type === "set_all_channel_topics_in_category") {
        const category = findCategoryByName(guild, op.categoryName)
        if (!category) {
          results.push(language === "tr" ? `Kategori bulunamadı: ${op.categoryName}` : `Category not found: ${op.categoryName}`)
        } else {
          const children = guild.channels.cache
            .filter(
              c =>
                c.parentId === category.id &&
                (c.type === ChannelType.GuildText || c.type === ChannelType.GuildForum)
            )
            .sort((a, b) => a.rawPosition - b.rawPosition)

          if (!children.size) {
            results.push(language === "tr" ? `Açıklaması değiştirilebilecek yazı kanalı yok: ${category.name}` : `No text-based channels to update in category: ${category.name}`)
          } else {
            for (const [, ch] of children) {
              await ch.setTopic(op.topic || "")
            }
            results.push(language === "tr" ? `Kategorideki uygun kanalların açıklamaları değiştirildi: ${category}` : `Updated topics in category: ${category.name}`)
          }
        }
      }
    } catch (err) {
      const label = op.type || "unknown"
      results.push(
        language === "tr"
          ? `İşlem başarısız: ${label}`
          : `Operation failed: ${label}`
      )
    }
  }

  if (!results.length) {
    await message.reply(
      language === "tr"
        ? "Yönetim işlemi algıladım ama uygulanacak net bir adım çıkaramadım."
        : "I detected a management request but could not extract a clear action."
    )
    return true
  }

  await message.reply(results.join("\n"))
  return true
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
  if (!hasTrigger) return

  if (repliedMessages.has(message.id)) return
  repliedMessages.add(message.id)
  setTimeout(() => repliedMessages.delete(message.id), 15000)

  if (isOnCooldown(message.author.id)) return
  setCooldown(message.author.id, 1400)

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

  if (isLowSignal(question)) {
    await message.reply(
      language === "tr"
        ? "Daha net yazarsan daha iyi yardımcı olabilirim."
        : "If you say it more clearly, I can help better."
    )
    return
  }

  try {
    await message.channel.sendTyping()

    const managementPlan = await detectManagementPlan(question, language)

    if (managementPlan.isManagementRequest) {
      const handled = await executeManagementPlan(message, managementPlan, language)
      if (handled) return
    }

    const recent = state.recentMessages.slice(-4).join("\n")
    const styleInstruction = buildStyleInstruction(language, tone, replyProfile.style)
    const firstTime = !greetedUsers.has(message.author.id)

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `You are ${BOT_NAME}, a smart conversational Discord AI developed by ${FOUNDER_NAME}. You can answer questions, write code, generate text, brainstorm ideas, help with decisions, and manage server structure. If asked about your founder, say your founder is ${FOUNDER_NAME}. Respect the user's current language mode. ${styleInstruction}`
        },
        {
          role: "system",
          content:
            `Recent context from this same user:\n${recent || "No recent context."}\n\nThis is ${firstTime ? "the first meaningful interaction with this user today" : "not the first interaction with this user today"}. If it is the first one, a brief natural greeting is okay. Otherwise, answer directly.`
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
    console.error("ERROR:", error)
    await message.reply(
      language === "tr"
        ? "Şu an bir hata oluştu. Birazdan tekrar dene."
        : "I ran into an error. Try again in a moment."
    )
  }
})

client.login(process.env.TOKEN)