// context-lens — core engine
// Analyzes LLM prompt payloads: token counts, cost estimates, waste detection

export const PRICING = {
  anthropic: {
    "claude-opus-4": { input: 15.0, output: 75.0, label: "Claude Opus 4" },
    "claude-sonnet-4": { input: 3.0, output: 15.0, label: "Claude Sonnet 4" },
    "claude-haiku-4": { input: 0.80, output: 4.0, label: "Claude Haiku 4" },
  },
  openai: {
    "gpt-4o": { input: 2.50, output: 10.0, label: "GPT-4o" },
    "gpt-4o-mini": { input: 0.15, output: 0.60, label: "GPT-4o mini" },
    "o1": { input: 15.0, output: 60.0, label: "o1" },
  },
  groq: {
    "llama-3.3-70b": { input: 0.59, output: 0.79, label: "Llama 3.3 70B" },
    "llama-3.1-8b": { input: 0.05, output: 0.08, label: "Llama 3.1 8B" },
    "mixtral-8x7b": { input: 0.24, output: 0.24, label: "Mixtral 8x7B" },
  },
};

// Rough but accurate tokenizer: ~4 chars per token for English prose
// Code and JSON are denser, whitespace inflates count — we account for both
function estimateTokens(text) {
  if (!text || typeof text !== "string") return 0;
  const words = text.trim().split(/\s+/).length;
  const chars = text.length;
  // GPT-style tokenization heuristic: blend word and char estimate
  const byWords = Math.ceil(words * 1.33);
  const byChars = Math.ceil(chars / 4);
  return Math.round((byWords + byChars) / 2);
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : c?.text || JSON.stringify(c)))
      .join("\n");
  }
  return JSON.stringify(content);
}

function analyzeRole(role, content) {
  const text = extractText(content);
  const tokens = estimateTokens(text);
  const chars = text.length;

  const warnings = [];

  // Detect boilerplate / filler patterns
  const boilerplatePatterns = [
    { pattern: /you are a helpful assistant/i, label: "generic assistant opener" },
    { pattern: /please respond in (json|markdown|bullet)/i, label: "format instruction (consider putting in user message)" },
    { pattern: /(.{80,})\1/s, label: "repeated block detected" },
    { pattern: /\n{4,}/g, label: "excessive blank lines" },
  ];

  for (const { pattern, label } of boilerplatePatterns) {
    if (pattern.test(text)) warnings.push(label);
  }

  if (role === "system" && tokens > 800) {
    warnings.push(`system prompt is large (${tokens} tokens) — audit for unused instructions`);
  }

  // Detect code blocks — these are token-expensive
  const codeBlocks = (text.match(/```[\s\S]*?```/g) || []);
  const codeTokens = codeBlocks.reduce((sum, b) => sum + estimateTokens(b), 0);
  const codePercent = tokens > 0 ? Math.round((codeTokens / tokens) * 100) : 0;

  return {
    role,
    tokens,
    chars,
    text: text.slice(0, 120) + (text.length > 120 ? "…" : ""),
    warnings,
    codeBlocks: codeBlocks.length,
    codeTokens,
    codePercent,
  };
}

export function analyze(payload) {
  const messages = payload.messages || [];
  const systemPrompt = payload.system || null;
  const tools = payload.tools || [];

  const breakdown = [];

  if (systemPrompt) {
    breakdown.push(analyzeRole("system", systemPrompt));
  }

  for (const msg of messages) {
    breakdown.push(analyzeRole(msg.role, msg.content));
  }

  // Tool definitions are tokens too — developers often forget this
  let toolTokens = 0;
  if (tools.length > 0) {
    const toolText = JSON.stringify(tools);
    toolTokens = estimateTokens(toolText);
    breakdown.push({
      role: "tools",
      tokens: toolTokens,
      chars: toolText.length,
      text: `${tools.length} tool definition(s): ${tools.map((t) => t.name || t?.function?.name || "unnamed").join(", ")}`,
      warnings: toolTokens > 500 ? ["tool definitions are large — consider trimming descriptions"] : [],
      codeBlocks: 0,
      codeTokens: 0,
      codePercent: 0,
    });
  }

  const totalInputTokens = breakdown.reduce((sum, r) => sum + r.tokens, 0);
  const allWarnings = breakdown.flatMap((r) => r.warnings.map((w) => ({ role: r.role, warning: w })));

  // Cost across all providers
  const costs = {};
  for (const [provider, models] of Object.entries(PRICING)) {
    costs[provider] = {};
    for (const [modelId, pricing] of Object.entries(models)) {
      const inputCost = (totalInputTokens / 1_000_000) * pricing.input;
      // Estimate output as 30% of input as a reasonable default
      const estimatedOutput = Math.round(totalInputTokens * 0.3);
      const outputCost = (estimatedOutput / 1_000_000) * pricing.output;
      costs[provider][modelId] = {
        label: pricing.label,
        inputCost: inputCost.toFixed(6),
        outputCost: outputCost.toFixed(6),
        totalCost: (inputCost + outputCost).toFixed(6),
        perThousandCalls: ((inputCost + outputCost) * 1000).toFixed(4),
      };
    }
  }

  // Efficiency score: penalize warnings and large system prompts
  const warningPenalty = allWarnings.length * 8;
  const systemRatio = breakdown.find((r) => r.role === "system")?.tokens || 0;
  const systemPenalty = systemRatio > totalInputTokens * 0.6 ? 15 : 0;
  const efficiencyScore = Math.max(0, 100 - warningPenalty - systemPenalty);

  return {
    breakdown,
    totalInputTokens,
    allWarnings,
    costs,
    efficiencyScore,
    summary: {
      messageCount: messages.length,
      toolCount: tools.length,
      hasSystem: !!systemPrompt,
      dominantRole: breakdown.sort((a, b) => b.tokens - a.tokens)[0]?.role || "none",
    },
  };
}
