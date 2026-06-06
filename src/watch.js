// context-lens — watch mode
// Re-analyzes payload file on every save, prints live diff in terminal

import { readFileSync } from "fs";
import { watch } from "fs";
import { analyze } from "./index.js";

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
  clear: "\x1Bc",
};

const roleColor = {
  system: c.purple,
  user: c.blue,
  assistant: c.green,
  tools: c.yellow,
};

function printAnalysis(result, filePath, previous) {
  const { breakdown, totalInputTokens, allWarnings, costs, efficiencyScore } = result;

  const scoreCol = efficiencyScore >= 80 ? c.green : efficiencyScore >= 50 ? c.yellow : c.red;

  // Delta from previous run
  const delta = previous ? totalInputTokens - previous.totalInputTokens : 0;
  const deltaStr = delta === 0
    ? ""
    : delta > 0
      ? ` ${c.red}(+${delta})${c.reset}`
      : ` ${c.green}(${delta})${c.reset}`;

  const cheapestModel = Object.entries(costs)
    .flatMap(([provider, models]) => Object.entries(models).map(([, m]) => ({ provider, ...m })))
    .sort((a, b) => parseFloat(a.totalCost) - parseFloat(b.totalCost))[0];

  process.stdout.write(c.clear);

  console.log(`${c.bold}  ◈ context-lens${c.reset}  ${c.dim}--watch${c.reset}  ${c.dim}${filePath}${c.reset}`);
  console.log(`  ${c.dim}Watching for changes — Ctrl+C to exit${c.reset}\n`);

  console.log(`  ${c.bold}Efficiency score:${c.reset} ${scoreCol}${efficiencyScore}/100${c.reset}  ${c.dim}(${efficiencyScore >= 80 ? "efficient" : efficiencyScore >= 50 ? "needs work" : "wasteful"})${c.reset}`);
  console.log(`  ${c.bold}Total tokens:${c.reset}     ${c.cyan}${totalInputTokens.toLocaleString()}${c.reset}${deltaStr}`);
  console.log(`  ${c.bold}Cheapest option:${c.reset}  ${c.dim}${cheapestModel?.provider}${c.reset} ${cheapestModel?.label} ${c.cyan}$${cheapestModel?.totalCost}/call${c.reset}\n`);

  console.log(`  ${c.bold}─── Token breakdown ───────────────────────────────────${c.reset}`);

  for (const r of breakdown) {
    const pct = totalInputTokens > 0 ? ((r.tokens / totalInputTokens) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round(parseFloat(pct) / 4)).padEnd(25, "░");
    const col = roleColor[r.role] || c.dim;

    // Show per-role delta
    const prevRole = previous?.breakdown?.find(p => p.role === r.role && p.text === r.text);
    const roleDelta = prevRole ? r.tokens - prevRole.tokens : 0;
    const roleDeltaStr = roleDelta === 0 ? "" : roleDelta > 0 ? ` ${c.red}+${roleDelta}${c.reset}` : ` ${c.green}${roleDelta}${c.reset}`;

    console.log(`  ${col}${r.role.padEnd(12)}${c.reset} ${bar} ${c.cyan}${String(r.tokens).padStart(6)}${c.reset}${roleDeltaStr} ${c.dim}(${pct}%)${c.reset}`);
  }

  if (allWarnings.length > 0) {
    console.log(`\n  ${c.bold}─── Warnings ───────────────────────────────────────────${c.reset}`);
    for (const w of allWarnings) {
      console.log(`  ${c.yellow}⚠${c.reset}  ${c.dim}[${w.role}]${c.reset} ${w.warning}`);
    }
  } else {
    console.log(`\n  ${c.green}✓${c.reset}  ${c.dim}No issues detected${c.reset}`);
  }

  console.log(`\n  ${c.dim}Last updated: ${new Date().toLocaleTimeString()}${c.reset}`);

  return result;
}

export function startWatch(filePath) {
  let previous = null;
  let debounceTimer = null;

  function runAnalysis() {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const payload = JSON.parse(raw);
      const result = analyze(payload);
      previous = printAnalysis(result, filePath, previous);
    } catch (e) {
      process.stdout.write(c.clear);
      console.log(`${c.bold}  ◈ context-lens${c.reset}  ${c.dim}--watch${c.reset}\n`);
      console.log(`  ${c.yellow}⚠${c.reset}  Could not parse ${filePath}: ${e.message}`);
      console.log(`  ${c.dim}Fix the JSON and save again...${c.reset}`);
    }
  }

  // Initial run
  runAnalysis();

  // Watch for changes
  watch(filePath, (eventType) => {
    if (eventType === "change") {
      // Debounce — editors often write files in multiple events
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runAnalysis, 120);
    }
  });

  console.log(); // breathing room before first render
}
