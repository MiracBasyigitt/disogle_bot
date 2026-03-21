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

async function createCategory(guild, name) {
  const existing = findCategoryByName(guild, name)
  if (existing) {
    return {
      ok: false,
      message: `Category already exists: ${existing.name}`,
      category: existing
    }
  }

  const created = await guild.channels.create({
    name: String(name || "").trim(),
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

  await category.setName(String(newName || "").trim())

  return {
    ok: true,
    message: `Renamed category to: ${category.name}`,
    category
  }
}

module.exports = {
  findCategoryByName,
  createCategory,
  deleteCategory,
  renameCategory
}