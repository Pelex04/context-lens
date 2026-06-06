# Contributing to context-lens

Thanks for wanting to improve context-lens. This is a straightforward Node.js CLI — contributions of any size are welcome.

## What we need most

- **New provider pricing** — if a provider's prices change or a new model launches, a PR updating `src/index.js` is always useful
- **New rules** — if you spot a common token-waste pattern not caught by the rules engine, add it to `src/rules.js`
- **Bug reports** — open an issue with your payload (redact any sensitive data) and the unexpected output

## Getting started

```bash
git clone https://github.com/Pelex04/context-lens.git
cd context-lens
```

No dependencies to install — the project is zero-dependency by design.

Test your changes:

```bash
node src/cli.js test-payload.json
node src/cli.js test-payload.json --report
node src/cli.js test-payload.json --optimize
```

## Adding a new provider or model

Open `src/index.js` and add to the `PRICING` object:

```js
yourprovider: {
  "model-id": { input: 0.50, output: 1.50, label: "Model Display Name" },
}
```

Prices are in USD per 1,000,000 tokens.

## Adding a new optimization rule

Open `src/rules.js` and add to the rules inside `applyRules()`:

```js
const beforeCount = result.length;
result = result.replace(/your pattern/gi, "replacement");
if (result.length !== beforeCount) changes.push("Description of what was fixed");
```

Keep rules surgical — they should never change the meaning of an instruction, only remove waste.

## Pull request checklist

- [ ] Tested against `test-payload.json`
- [ ] No new dependencies added (keep it zero-dependency)
- [ ] Pricing data sourced from the provider's official pricing page (include the URL in the PR description)

## Opening an issue

Use the labels:
- `bug` — something broken
- `enhancement` — new feature idea
- `optimization` — new rule or Groq prompt improvement
- `provider-support` — new provider or model pricing

## Code style

Plain ESM JavaScript. No TypeScript, no build step, no bundler. If it runs with `node src/cli.js` it's good.
