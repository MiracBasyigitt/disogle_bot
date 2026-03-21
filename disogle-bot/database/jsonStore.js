const fs = require("fs")
const path = require("path")

const baseDir = path.join(__dirname, "data")

if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir, { recursive: true })
}

function getFile(name) {
  return path.join(baseDir, name)
}

function readJson(name, fallback) {
  const file = getFile(name)

  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8")
      return fallback
    }

    const raw = fs.readFileSync(file, "utf8")
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(name, value) {
  const file = getFile(name)
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8")
}

module.exports = {
  readJson,
  writeJson
}