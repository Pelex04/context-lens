#!/usr/bin/env node
// context-lens CLI
// Usage: context-lens <payload.json> [--report] [--optimize] [--providers]

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { analyze, PRICING } from "./index.js";
import { generateReport } from "./report.js";
import { applyRules } from "./rules.js";
import { groqRewrite } from "./groq.js";

// Load .env manually — no dependency needed
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help")) {
  console.log(`
  ◈ context-lens — LLM token debugger

  Usage:
    context-lens <payload.json>               Analyze and print to terminal
    context-lens <payload.json> --report      Also generate an HTML report
    context-lens <payload.json> --optimize    Optimize system prompt (rules + Groq)
    context-lens --providers                  List supported models and pricing

  Optimize requires GROQ_API_KEY in your .env file:
    GROQ_API_KEY=your_key_here

  Examples:
    context-lens ./my-prompt.json
    context-lens ./my-prompt.json --report
    context-lens ./my-prompt.json --optimize
    context-lens ./my-prompt.json --optimize --report
  `);
  process.exit(0);
}

if (args.includes("--providers")) {
  console.log("\n  Supported providers and models:\n");
  for (const [provider, models] of Object.entries(PRICING)) {
    console.log(`  ${provider.toUpperCase()}`);
    for (const [, m] of Object.entries(models)) {
      console.log(`    ${m.label.padEnd(22)} input: $${m.input}/M   output: $${m.output}/M`);
    }
    console.log();
  }
  process.exit(0);
}

const filePath = args[0];
let payload;

try {
  const raw = readFileSync(filePath, "utf-8");
  payload = JSON.parse(raw);
} catch (e) {
  console.error(`\n  ✗ Could not read or parse ${filePath}: ${e.message}\n`);
  process.exit(1);
}

const result = analyze(payload);
const { breakdown, totalInputTokens, allWarnings, costs, efficiencyScore, summary } = result;

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  purple: "\x1b[35m",
  blue: "\x1b[34m",
};

const scoreCol = efficiencyScore >= 80 ? c.green : efficiencyScore >= 50 ? c.yellow : c.red;

console.log(`\n${c.bold}  ◈ context-lens${c.reset}  ${c.dim}token analysis${c.reset}\n`);
console.log(`  ${c.bold}Efficiency score:${c.reset} ${scoreCol}${efficiencyScore}/100${c.reset}  ${c.dim}(${efficiencyScore >= 80 ? "efficient" : efficiencyScore >= 50 ? "needs work" : "wasteful"})${c.reset}`);
console.log(`  ${c.bold}Total input tokens:${c.reset} ${c.cyan}${totalInputTokens.toLocaleString()}${c.reset}`);
console.log(`  Messages: ${summary.messageCount}   Tools: ${summary.toolCount}   System: ${summary.hasSystem ? "yes" : "no"}\n`);

console.log(`  ${c.bold}─── Token breakdown ───────────────────────────────────${c.reset}`);
const roleColor = { system: c.purple, user: c.blue, assistant: c.green, tools: c.yellow };
for (const r of breakdown) {
  const pct = totalInputTokens > 0 ? ((r.tokens / totalInputTokens) * 100).toFixed(1) : "0.0";
  const bar = "█".repeat(Math.round(parseFloat(pct) / 4)).padEnd(25, "░");
  const col = roleColor[r.role] || c.dim;
  console.log(`  ${col}${r.role.padEnd(12)}${c.reset} ${bar} ${c.cyan}${String(r.tokens).padStart(6)}${c.reset} ${c.dim}(${pct}%)${c.reset}`);
}

console.log(`\n  ${c.bold}─── Cost estimates (per call) ──────────────────────────${c.reset}`);
const allModels = [];
for (const [provider, models] of Object.entries(costs)) {
  for (const [, data] of Object.entries(models)) {
    allModels.push({ provider, ...data });
  }
}
allModels.sort((a, b) => parseFloat(a.totalCost) - parseFloat(b.totalCost));
for (const m of allModels.slice(0, 6)) {
  const provCol = { anthropic: c.purple, openai: c.green, groq: c.blue }[m.provider] || c.dim;
  console.log(`  ${provCol}${m.provider.padEnd(12)}${c.reset} ${m.label.padEnd(22)} ${c.cyan}$${m.totalCost}${c.reset}  ${c.dim}($${m.perThousandCalls}/1k calls)${c.reset}`);
}

if (allWarnings.length > 0) {
  console.log(`\n  ${c.bold}─── Warnings ───────────────────────────────────────────${c.reset}`);
  for (const w of allWarnings) {
    console.log(`  ${c.yellow}⚠${c.reset}  ${c.dim}[${w.role}]${c.reset} ${w.warning}`);
  }
}

// ─── OPTIMIZE ────────────────────────────────────────────────────────────────
if (args.includes("--optimize")) {
  const systemText = payload.system || null;

  if (!systemText) {
    console.log(`\n  ${c.yellow}⚠${c.reset}  No system prompt found in payload — nothing to optimize.\n`);
    process.exit(0);
  }

  console.log(`\n  ${c.bold}─── Optimizing system prompt ───────────────────────────${c.reset}`);
  console.log(`  ${c.dim}Step 1: Applying rules engine...${c.reset}`);

  const { optimized: afterRules, changes, formatInstructions } = applyRules(systemText);
  const tokensBefore = breakdown.find(r => r.role === "system")?.tokens || 0;

  const { analyze: reanalyze } = await import("./index.js");
  const tokensAfterRules = Math.round(afterRules.length / 4);

  for (const change of changes) {
    console.log(`  ${c.green}✓${c.reset} ${change}`);
  }

  if (formatInstructions.length > 0) {
    console.log(`\n  ${c.yellow}⚠${c.reset}  Format instructions detected — consider moving to user message:`);
    for (const f of formatInstructions) {
      console.log(`     ${c.dim}"${f}"${c.reset}`);
    }
  }

  // Step 2: Groq rewrite
  const groqKey = process.env.GROQ_API_KEY;
  let finalText = afterRules;
  let tokensAfterGroq = tokensAfterRules;
  let groqUsed = false;

  if (groqKey) {
    console.log(`\n  ${c.dim}Step 2: Groq Llama 3.3 70B rewriting...${c.reset}`);
    const { rewritten, error } = await groqRewrite(afterRules, groqKey);

    if (error) {
      console.log(`  ${c.yellow}⚠${c.reset}  Groq error: ${error}`);
      console.log(`  ${c.dim}Falling back to rules-only result.${c.reset}`);
    } else {
      finalText = rewritten;
      tokensAfterGroq = Math.round(rewritten.length / 4);
      groqUsed = true;
      console.log(`  ${c.green}✓${c.reset} Groq rewrite complete`);
    }
  } else {
    console.log(`\n  ${c.dim}Step 2: Skipped (no GROQ_API_KEY in .env — rules only)${c.reset}`);
  }

  // Results
  const totalSaved = tokensBefore - tokensAfterGroq;
  const pctSaved = tokensBefore > 0 ? ((totalSaved / tokensBefore) * 100).toFixed(1) : 0;

  console.log(`\n  ${c.bold}─── Results ────────────────────────────────────────────${c.reset}`);
  console.log(`  Before:  ${c.red}${tokensBefore} tokens${c.reset}`);
  console.log(`  After rules: ${c.yellow}${tokensAfterRules} tokens${c.reset}`);
  if (groqUsed) {
    console.log(`  After Groq:  ${c.green}${tokensAfterGroq} tokens${c.reset}`);
  }
  console.log(`  ${c.bold}Saved:   ${c.green}${totalSaved} tokens (${pctSaved}%)${c.reset}`);

  // Cost savings at scale
  const groqPricePerM = 0.59;
  const savedPer1k = ((totalSaved / 1_000_000) * groqPricePerM * 1000).toFixed(4);
  console.log(`  At 1,000 calls/day on Groq: saves ~$${savedPer1k}/day\n`);

  console.log(`  ${c.bold}─── Optimized system prompt ────────────────────────────${c.reset}\n`);
  console.log(finalText.split("\n").map(l => `  ${c.dim}│${c.reset} ${l}`).join("\n"));

  // Save optimized payload
  const optimizedPayload = { ...payload, system: finalText };
  const outPath = filePath.replace(/\.json$/, "") + "-optimized.json";
  writeFileSync(outPath, JSON.stringify(optimizedPayload, null, 2), "utf-8");
  console.log(`\n  ${c.green}✓${c.reset} Optimized payload saved: ${outPath}`);

  // Update result for report
  result.optimized = {
    finalText,
    tokensBefore,
    tokensAfterRules,
    tokensAfterGroq,
    totalSaved,
    pctSaved,
    changes,
    groqUsed,
  };
}

if (args.includes("--report")) {
  const reportPath = filePath.replace(/\.json$/, "") + "-report.html";
  const html = generateReport(result, payload);
  writeFileSync(reportPath, html, "utf-8");
  console.log(`\n  ${c.green}✓${c.reset} HTML report saved: ${reportPath}\n`);
} else {
  console.log(`\n  ${c.dim}Tip: add --report to generate a full HTML report${c.reset}\n`);
}
