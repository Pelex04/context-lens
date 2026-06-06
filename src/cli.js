#!/usr/bin/env node
// context-lens CLI
// Usage: context-lens <payload.json> [--report] [--provider groq]

import { readFileSync, writeFileSync } from "fs";
import { analyze, PRICING } from "./index.js";
import { generateReport } from "./report.js";

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help")) {
  console.log(`
  ◈ context-lens — LLM token debugger

  Usage:
    context-lens <payload.json>              Analyze and print to terminal
    context-lens <payload.json> --report     Also generate an HTML report
    context-lens --providers                 List supported models and pricing

  Examples:
    context-lens ./my-prompt.json
    context-lens ./my-prompt.json --report
  `);
  process.exit(0);
}

if (args.includes("--providers")) {
  console.log("\n  Supported providers and models:\n");
  for (const [provider, models] of Object.entries(PRICING)) {
    console.log(`  ${provider.toUpperCase()}`);
    for (const [id, m] of Object.entries(models)) {
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

// Terminal output
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

if (args.includes("--report")) {
  const reportPath = filePath.replace(/\.json$/, "") + "-report.html";
  const html = generateReport(result, payload);
  writeFileSync(reportPath, html, "utf-8");
  console.log(`\n  ${c.green}✓${c.reset} HTML report saved: ${reportPath}\n`);
} else {
  console.log(`\n  ${c.dim}Tip: add --report to generate a full HTML report${c.reset}\n`);
}
