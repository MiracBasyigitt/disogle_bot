const { normalize } = require("../ai/language")

function findRoleByName(guild, name) {
  const target = normalize(name).replace(/^@/, "")
  return guild.roles.cache.find(role => normalize(role.name) === target)
}

async function createRole(guild, name, color = null) {
  const existing = findRoleByName(guild, name)
  if (existing) {
    return {
      ok: false,
      message: `Role already exists: ${existing.name}`,
      role: existing
    }
  }

  const created = await guild.roles.create({
    name: String(name || "").trim(),
    color: color || undefined,
    reason: "Disogle role creation"
  })

  return {
    ok: true,
    message: `Created role: ${created.name}`,
    role: created
  }
}

async function assignRole(guild, memberId, roleName) {
  const member = await guild.members.fetch(memberId).catch(() => null)
  if (!member) {
    return {
      ok: false,
      message: "User not found."
    }
  }

  const role = findRoleByName(guild, roleName)
  if (!role) {
    return {
      ok: false,
      message: `Role not found: ${roleName}`
    }
  }

  await member.roles.add(role)

  return {
    ok: true,
    message: `Assigned role ${role.name} to ${member.user.tag}`,
    role,
    member
  }
}

async function removeRole(guild, memberId, roleName) {
  const member = await guild.members.fetch(memberId).catch(() => null)
  if (!member) {
    return {
      ok: false,
      message: "User not found."
    }
  }

  const role = findRoleByName(guild, roleName)
  if (!role) {
    return {
      ok: false,
      message: `Role not found: ${roleName}`
    }
  }

  await member.roles.remove(role)

  return {
    ok: true,
    message: `Removed role ${role.name} from ${member.user.tag}`,
    role,
    member
  }
}

module.exports = {
  findRoleByName,
  createRole,
  assignRole,
  removeRole
}