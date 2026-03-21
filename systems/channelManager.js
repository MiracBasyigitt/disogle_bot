const { ChannelType, PermissionFlagsBits, OverwriteType } = require("discord.js")
const { normalize } = require("../ai/language")
const { slugify } = require("../ai/intentParser")
const {
  findCategoryByName,
  createCategory,
  deleteCategory,
  renameCategory,
  deleteAllCategoriesAndChannels
} = require("./categoryManager")

function findChannelByName(guild, name) {
  const target = normalize(name).replace(/^#/, "")
  return guild.channels.cache.find(
    channel =>
      channel.type !== ChannelType.GuildCategory &&
      normalize(channel.name) === target
  )
}

function findVoiceChannelByName(guild, name) {
  const target = normalize(name)
  return guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildVoice &&
      normalize(channel.name) === target
  )
}

function uniqueChannelName(guild, parentId, desiredName) {
  const base = slugify(desiredName) || "channel"
  let current = base
  let i = 2

  while (
    guild.channels.cache.find(
      channel => channel.parentId === parentId && channel.name === current
    )
  ) {
    current = `${base}-${i}`
    i++
  }

  return current
}

function resolvePermissionName(name) {
  if (!name) return null
  return PermissionFlagsBits[name] || null
}

function buildPermissionOverwrites(guild, permissionConfig = [], requesterId = null) {
  const overwrites = []

  for (const item of Array.isArray(permissionConfig) ? permissionConfig : []) {
    const subject = String(item.subject || "").trim().toLowerCase()
    const allow = Array.isArray(item.allow) ? item.allow.map(resolvePermissionName).filter(Boolean) : []
    const deny = Array.isArray(item.deny) ? item.deny.map(resolvePermissionName).filter(Boolean) : []

    let id = null
    let type = OverwriteType.Role

    if (subject === "everyone" || subject === "@everyone") {
      id = guild.roles.everyone.id
      type = OverwriteType.Role
    } else if (subject === "requester" && requesterId) {
      id = requesterId
      type = OverwriteType.Member
    } else {
      const role = guild.roles.cache.find(role => normalize(role.name) === normalize(subject))
      if (!role) continue
      id = role.id
      type = OverwriteType.Role
    }

    overwrites.push({
      id,
      type,
      allow,
      deny
    })
  }

  return overwrites
}

async function createChannel(guild, options = {}) {
  const {
    categoryName = null,
    channelName = "general",
    channelType = "text",
    topic = null,
    userLimit = null,
    permissionOverwrites = [],
    requesterId = null
  } = options

  let parent = null

  if (categoryName) {
    parent = findCategoryByName(guild, categoryName)
    if (!parent) {
      return {
        ok: false,
        message: `Category not found: ${categoryName}`
      }
    }
  }

  const type = channelType === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText
  const finalName = uniqueChannelName(guild, parent?.id || null, channelName)

  const payload = {
    name: finalName,
    type,
    parent: parent?.id || null
  }

  const overwrites = buildPermissionOverwrites(guild, permissionOverwrites, requesterId)
  if (overwrites.length) payload.permissionOverwrites = overwrites

  if (type === ChannelType.GuildText && topic) {
    payload.topic = String(topic).trim().slice(0, 1024)
  }

  if (type === ChannelType.GuildVoice && Number.isFinite(userLimit) && userLimit >= 0) {
    payload.userLimit = Math.max(0, Math.min(99, Number(userLimit)))
  }

  const created = await guild.channels.create(payload)

  return {
    ok: true,
    message: `Created channel: ${created.name}`,
    channel: created
  }
}

async function deleteChannel(guild, name) {
  const channel = findChannelByName(guild, name)

  if (!channel) {
    return {
      ok: false,
      message: `Channel not found: ${name}`
    }
  }

  await channel.delete()

  return {
    ok: true,
    message: `Deleted channel: ${channel.name}`
  }
}

async function renameChannel(guild, oldName, newName) {
  const channel = findChannelByName(guild, oldName)

  if (!channel) {
    return {
      ok: false,
      message: `Channel not found: ${oldName}`
    }
  }

  await channel.setName(slugify(newName))

  return {
    ok: true,
    message: `Renamed channel to: ${channel.name}`,
    channel
  }
}

async function moveChannel(guild, channelName, targetCategoryName) {
  const channel = findChannelByName(guild, channelName)

  if (!channel) {
    return {
      ok: false,
      message: `Channel not found: ${channelName}`
    }
  }

  const category = findCategoryByName(guild, targetCategoryName)

  if (!category) {
    return {
      ok: false,
      message: `Category not found: ${targetCategoryName}`
    }
  }

  await channel.setParent(category.id)

  return {
    ok: true,
    message: `Moved channel: ${channel.name} -> ${category.name}`,
    channel,
    category
  }
}

async function setChannelTopic(guild, channelName, topic) {
  const channel = findChannelByName(guild, channelName)

  if (!channel) {
    return {
      ok: false,
      message: `Channel not found: ${channelName}`
    }
  }

  if (channel.type !== ChannelType.GuildText) {
    return {
      ok: false,
      message: `Topic can only be set for text channels: ${channel.name}`
    }
  }

  await channel.setTopic(String(topic || "").trim().slice(0, 1024))

  return {
    ok: true,
    message: `Updated topic for: ${channel.name}`,
    channel
  }
}

function translateManagementMessage(message) {
  return String(message || "")
    .replace("Created category:", "Kategori açıldı:")
    .replace("Deleted category:", "Kategori silindi:")
    .replace("Renamed category to:", "Kategori adı değişti:")
    .replace("Created channel:", "Kanal açıldı:")
    .replace("Deleted channel:", "Kanal silindi:")
    .replace("Renamed channel to:", "Kanal adı değişti:")
    .replace("Moved channel:", "Kanal taşındı:")
    .replace("Category not found:", "Kategori bulunamadı:")
    .replace("Channel not found:", "Kanal bulunamadı:")
    .replace("Updated topic for:", "Kanal açıklaması güncellendi:")
    .replace("Topic can only be set for text channels:", "Açıklama sadece yazı kanallarında ayarlanabilir:")
    .replace("Deleted ", "Silindi: ")
}

async function executeManagementPlan(guild, member, plan, language) {
  if (!Array.isArray(plan.operations) || !plan.operations.length) {
    return language === "tr"
      ? "Yönetim komutu anlaşılamadı."
      : "Management command could not be understood."
  }

  const results = []

  for (const operation of plan.operations) {
    let result = null

    if (operation.type === "create_category") {
      result = await createCategory(guild, operation.categoryName)
    }

    if (operation.type === "delete_category") {
      result = await deleteCategory(guild, operation.categoryName)
    }

    if (operation.type === "rename_category") {
      result = await renameCategory(guild, operation.categoryName, operation.newCategoryName)
    }

    if (operation.type === "create_channel") {
      result = await createChannel(guild, {
        categoryName: operation.categoryName,
        channelName: operation.channelName,
        channelType: operation.channelType,
        topic: operation.topic,
        userLimit: operation.userLimit,
        permissionOverwrites: operation.permissions,
        requesterId: member?.id || null
      })
    }

    if (operation.type === "delete_channel") {
      result = await deleteChannel(guild, operation.channelName)
    }

    if (operation.type === "rename_channel") {
      result = await renameChannel(guild, operation.channelName, operation.newChannelName)
    }

    if (operation.type === "move_channel") {
      result = await moveChannel(guild, operation.channelName, operation.targetCategoryName)
    }

    if (operation.type === "set_channel_topic") {
      result = await setChannelTopic(guild, operation.channelName, operation.topic)
    }

    if (operation.type === "delete_all_structure") {
      result = await deleteAllCategoriesAndChannels(guild)
    }

    if (!result) {
      results.push(
        language === "tr"
          ? `Bilinmeyen işlem: ${operation.type}`
          : `Unknown operation: ${operation.type}`
      )
      continue
    }

    results.push(language === "tr" ? translateManagementMessage(result.message) : result.message)
  }

  return results.join("\n")
}

module.exports = {
  findChannelByName,
  findVoiceChannelByName,
  uniqueChannelName,
  buildPermissionOverwrites,
  createChannel,
  deleteChannel,
  renameChannel,
  moveChannel,
  setChannelTopic,
  executeManagementPlan
}