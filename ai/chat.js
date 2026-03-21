function buildSystemPrompt(language) {
  if (language === "tr") {
    return [
      "Doğal Türkçe konuş.",
      "Kısa, net, güvenilir ve özgüvenli cevap ver.",
      "Bot bir şey yapabiliyorsa öneri vermek yerine uygulamaya yönel.",
      "Gereksiz açıklama yapma.",
      "Sunucu yönetimi veya moderasyon isteği varsa sohbet gibi davranma."
    ].join(" ")
  }

  return [
    "Reply in natural English.",
    "Be concise, clear, confident, and practical.",
    "Prefer execution-oriented answers over vague suggestions.",
    "Do not ramble.",
    "If the message looks like a server-management or moderation request, do not respond like casual chat."
  ].join(" ")
}

function buildChatPrompt(language, content) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: buildSystemPrompt(language)
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: content
        }
      ]
    }
  ]
}

async function askAI(openai, model, language, content) {
  const response = await openai.responses.create({
    model,
    input: buildChatPrompt(language, content)
  })

  return String(response.output_text || "").trim()
}

module.exports = {
  buildChatPrompt,
  askAI
}