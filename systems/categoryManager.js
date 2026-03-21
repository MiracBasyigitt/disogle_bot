const { ChannelType } = require("discord.js")
const { normalize } = require("../ai/language")

function findCategoryByName(guild, name) {
  const target = normalize(name)
  return guild.channels.cache.find(
    channel =>
      channel.type === ChannelType.GuildCategory &&
      normalize(channel.name) === target
  )
}

function listCategories(guild) {
  return guild.channels.cache
    .filter(channel => channel.type === ChannelType.GuildCategory)
    .map(channel => channel)
}

async function createCategory(guild, name) {
  const cleanName = String(name || "").trim()
  if (!cleanName) {
    return {
      ok: false,
      message: "Category name is missing."
    }
  }

  const existing = findCategoryByName(guild, cleanName)
  if (existing) {
    return {
      ok: false,
      message: `Category already exists: ${existing.name}`,
      category: existing
    }
  }

  const created = await guild.channels.create({
    name: cleanName,
    type: ChannelType.GuildCategory
  })

  return {
    ok: true,
    message: `Created category: ${created.name}`,
    category: created
  }
}

async function deleteCategory(guild, name) {
  const category = findCategoryByName(guild, name)

  if (!category) {
    return {
      ok: false,
      message: `Category not found: ${name}`
    }
  }

  await category.delete()

  return {
    ok: true,
    message: `Deleted category: ${category.name}`
  }
}

async function renameCategory(guild, oldName, newName) {
  const category = findCategoryByName(guild, oldName)

  if (!category) {
    return {
      ok: false,
      message: `Category not found: ${oldName}`
    }
  }

  const cleanNewName = String(newName || "").trim()
  if (!cleanNewName) {
    return {
      ok: false,
      message: "New category name is missing."
    }
  }

  await category.setName(cleanNewName)

  return {
    ok: true,
    message: `Renamed category to: ${category.name}`,
    category
  }
}

async function deleteAllCategoriesAndChannels(guild) {
  const channels = [...guild.channels.cache.values()]
  const sorted = channels.sort((a, b) => {
    if (a.type === ChannelType.GuildCategory && b.type !== ChannelType.GuildCategory) return 1
    if (a.type !== ChannelType.GuildCategory && b.type === ChannelType.GuildCategory) return -1
    return 0
  })

  let deletedCount = 0

  for (const channel of sorted) {
    try {
      await channel.delete()
      deletedCount++
    } catch {}
  }

  return {
    ok: true,
    message: `Deleted ${deletedCount} channels/categories.`
  }
}

module.exports = {
  findCategoryByName,
  listCategories,
  createCategory,
  deleteCategory,
  renameCategory,
  deleteAllCategoriesAndChannels
}