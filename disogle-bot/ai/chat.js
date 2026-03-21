function buildChatPrompt(language, content) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            language === "tr"
              ? "Doğal Türkçe konuş. Kısa, net, güven veren ve insan gibi cevap ver. Gereksiz uzun yazma."
              : "Reply in natural English. Be concise, clear, confident, and human."
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