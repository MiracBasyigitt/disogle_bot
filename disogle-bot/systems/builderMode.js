const { createCategory } = require("./categoryManager")
const { createChannel } = require("./channelManager")

async function buildStarterServer(guild, language = "tr") {
  const created = []

  const mainCategoryName = language === "en" ? "Core" : "Ana Alan"
  const supportCategoryName = language === "en" ? "Support" : "Destek"
  const communityCategoryName = language === "en" ? "Community" : "Topluluk"

  const mainCategory = await createCategory(guild, mainCategoryName)
  created.push(mainCategory.message)

  const supportCategory = await createCategory(guild, supportCategoryName)
  created.push(supportCategory.message)

  const communityCategory = await createCategory(guild, communityCategoryName)
  created.push(communityCategory.message)

  const mainChannels = language === "en"
    ? [
        { name: "announcements", type: "text", topic: "Important server announcements." },
        { name: "rules", type: "text", topic: "Server rules and guidance." },
        { name: "general", type: "text", topic: "Main server chat." }
      ]
    : [
        { name: "duyurular", type: "text", topic: "Önemli sunucu duyuruları." },
        { name: "kurallar", type: "text", topic: "Sunucu kuralları ve rehber." },
        { name: "genel", type: "text", topic: "Ana sohbet alanı." }
      ]

  const supportChannels = language === "en"
    ? [
        { name: "support", type: "text", topic: "Get help here." },
        { name: "bot-commands", type: "text", topic: "Use bot features here." }
      ]
    : [
        { name: "destek", type: "text", topic: "Burada yardım al." },
        { name: "bot-komutlari", type: "text", topic: "Bot özelliklerini burada kullan." }
      ]

  const communityChannels = language === "en"
    ? [
        { name: "media", type: "text", topic: "Photos, clips, and media sharing." },
        { name: "voice-chat", type: "voice", topic: null }
      ]
    : [
        { name: "medya", type: "text", topic: "Fotoğraf, klip ve medya paylaşımları." },
        { name: "sesli-sohbet", type: "voice", topic: null }
      ]

  for (const channel of mainChannels) {
    const result = await createChannel(guild, {
      categoryName: mainCategoryName,
      channelName: channel.name,
      channelType: channel.type,
      topic: channel.topic
    })
    created.push(result.message)
  }

  for (const channel of supportChannels) {
    const result = await createChannel(guild, {
      categoryName: supportCategoryName,
      channelName: channel.name,
      channelType: channel.type,
      topic: channel.topic
    })
    created.push(result.message)
  }

  for (const channel of communityChannels) {
    const result = await createChannel(guild, {
      categoryName: communityCategoryName,
      channelName: channel.name,
      channelType: channel.type,
      topic: channel.topic
    })
    created.push(result.message)
  }

  return created.join("\n")
}

module.exports = {
  buildStarterServer
}