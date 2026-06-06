# ◈ context-lens

> Visualize, debug, and optimize your LLM token usage and costs — before your bill does it for you.

`context-lens` analyzes any LLM prompt payload and tells you exactly where your tokens are going, what it costs across every major provider, and what you should fix.

## Install

```bash
npm install -g context-lens
```

Or use without installing:

```bash
npx context-lens ./my-prompt.json
```

## Usage

```bash
# Analyze a payload and print to terminal
context-lens ./payload.json

# Also generate a full HTML report
context-lens ./payload.json --report

# List all supported models and pricing
context-lens --providers
```

## What it catches

- Bloated system prompts (repeated instructions, filler phrases)
- Token-expensive tool definitions you forgot to trim
- Format instructions sitting in the wrong role
- Excessive whitespace and blank lines
- System prompts dominating over 60% of your total budget

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

## Supported providers

| Provider  | Models |
|-----------|--------|
| Anthropic | Claude Opus 4, Sonnet 4, Haiku 4 |
| OpenAI    | GPT-4o, GPT-4o mini, o1 |
| Groq      | Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B |

## Use as a library

```js
import { analyze } from 'context-lens';

const result = analyze(payload);
console.log(result.totalInputTokens);
console.log(result.efficiencyScore);
console.log(result.costs);
```

## License

MIT
