const fs = require("fs")
const path = require("path")

const baseDir = path.join(__dirname, "data")

if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true })
}

function getFile(name) {
  return path.join(baseDir, name)
}

function ensureFile(name, fallback) {
  const file = getFile(name)

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8")
    return fallback
  }

  try {
    const raw = fs.readFileSync(file, "utf8")
    return JSON.parse(raw)
  } catch {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8")
    return fallback
  }
}

function readJson(name, fallback = {}) {
  return ensureFile(name, fallback)
}

function writeJson(name, value) {
  const file = getFile(name)
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8")
}

function updateJson(name, fallback = {}, updater) {
  const current = readJson(name, fallback)
  const next = typeof updater === "function" ? updater(current) : current
  writeJson(name, next)
  return next
}

module.exports = {
  getFile,
  readJson,
  writeJson,
  updateJson
}