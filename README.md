# ◈ context-lens

> Visualize, debug, and optimize your LLM token usage and costs — before your bill does it for you.

`context-lens` analyzes any LLM prompt payload and tells you exactly where your tokens are going, what it costs across every major provider, and what you should fix.

## Install

```bash
npm install -g @kadema/context-lens
```

Or use without installing:

```bash
npx @kadema/context-lens ./my-prompt.json
```

## Usage

```bash
# Analyze and print to terminal
context-lens ./payload.json

# Generate a full HTML report
context-lens ./payload.json --report

# Optimize your system prompt (rules engine + Groq Llama 3.3 70B)
context-lens ./payload.json --optimize

# Live token feedback — re-analyzes on every file save
context-lens ./payload.json --watch

# Combine flags
context-lens ./payload.json --optimize --report

# List all supported models and pricing
context-lens --providers
```

## What it catches

- Bloated system prompts (repeated instructions, filler phrases)
- Token-expensive tool definitions you forgot to trim
- Format instructions sitting in the wrong role
- Excessive whitespace and blank lines
- System prompts dominating over 60% of your total budget
- Near-duplicate sentences across your prompt

## --watch mode

Edit your payload file and save — context-lens instantly re-analyzes and reprints the breakdown. Shows token deltas so you can see exactly whether each edit made things better or worse.

```bash
context-lens ./payload.json --watch
```

Useful when iterating on a system prompt and you want live feedback without running the command manually each time.

## --optimize flag

Runs your system prompt through two passes:

1. **Rules engine** — free, instant, deterministic. Removes duplicates, compresses verbose phrases, collapses whitespace, strips filler.
2. **Groq Llama 3.3 70B** — free AI rewrite. Restructures and tightens what rules can't catch while preserving every instruction and meaning.

Typical savings: **20–50% token reduction** on real-world system prompts.

Requires a free Groq API key. Create a `.env` file in your project:

```
GROQ_API_KEY=your_groq_api_key_here
```

Get a free key at [console.groq.com](https://console.groq.com).

## Payload format

Standard Anthropic/OpenAI message format:

```json
{
  "system": "You are a helpful assistant...",
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi! How can I help?" }
  ],
  "tools": []
}
```

## Output

**Terminal:** Instant breakdown with token bars, cost table, and warnings.

**HTML report (`--report`):** Full visual report with efficiency score, role-by-role breakdown, cost comparison across Anthropic / OpenAI / Groq sorted cheapest first, and actionable recommendations.

**Optimized payload (`--optimize`):** Saves a `*-optimized.json` file with the cleaned system prompt ready to drop into your app.

## Supported providers

| Provider  | Models |
|-----------|--------|
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4 |
| OpenAI    | GPT-4o, GPT-4o mini, o1 |
| Groq      | Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B |

## Use as a library

```js
import { analyze } from '@kadema/context-lens';

const result = analyze(payload);
console.log(result.totalInputTokens);  // total tokens in payload
console.log(result.efficiencyScore);   // 0–100 score
console.log(result.costs);             // cost breakdown per provider
console.log(result.allWarnings);       // detected issues
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) — adding new provider pricing or optimization rules is a great first contribution.

## License

MIT
