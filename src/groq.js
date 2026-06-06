// context-lens — groq rewriter
// Uses Llama 3.3 70B (free) to restructure and tighten after rules engine runs

export async function groqRewrite(text, groqApiKey) {
  const systemPrompt = `You are a prompt engineer specializing in token efficiency.
Your job: rewrite system prompts to be as concise as possible while preserving every instruction and meaning.

Rules:
- Never remove actual instructions or constraints
- Never change the meaning or intent of any rule
- Remove redundancy, filler, and verbose phrasing
- Merge overlapping instructions into single clear statements
- Use direct imperative language (say "Respond in JSON" not "You should always make sure to respond in JSON format")
- Preserve technical terms, proper nouns, and specific values exactly
- Output ONLY the rewritten prompt — no explanation, no preamble, no commentary`;

  const userMessage = `Rewrite this system prompt to be more token-efficient while preserving all meaning and instructions:

---
${text}
---`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `Groq API error ${response.status}`);
    }

    const data = await response.json();
    const rewritten = data.choices?.[0]?.message?.content?.trim();

    if (!rewritten) throw new Error("Empty response from Groq");

    return { rewritten, error: null };
  } catch (err) {
    return { rewritten: null, error: err.message };
  }
}
