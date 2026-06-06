// context-lens — HTML report generator
// Produces a self-contained, styled HTML report from an analysis result

export function generateReport(result, originalPayload) {
  const { breakdown, totalInputTokens, allWarnings, costs, efficiencyScore, summary } = result;

  const scoreColor = efficiencyScore >= 80 ? "#22c55e" : efficiencyScore >= 50 ? "#f59e0b" : "#ef4444";
  const scoreLabel = efficiencyScore >= 80 ? "Efficient" : efficiencyScore >= 50 ? "Needs work" : "Wasteful";

  const roleColors = {
    system: "#6366f1",
    user: "#0ea5e9",
    assistant: "#10b981",
    tools: "#f59e0b",
  };

  const barRows = breakdown.map((r) => {
    const pct = totalInputTokens > 0 ? ((r.tokens / totalInputTokens) * 100).toFixed(1) : 0;
    const color = roleColors[r.role] || "#888";
    return `
      <tr>
        <td class="role-cell">
          <span class="role-badge" style="background:${color}20;color:${color}">${r.role}</span>
        </td>
        <td class="bar-cell">
          <div class="bar-wrap">
            <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
        </td>
        <td class="num-cell">${r.tokens.toLocaleString()}</td>
        <td class="pct-cell">${pct}%</td>
        <td class="preview-cell">${escHtml(r.text)}</td>
      </tr>
      ${r.warnings.map(w => `
      <tr class="warning-row">
        <td></td>
        <td colspan="4"><span class="warn-icon">⚠</span> ${escHtml(w)}</td>
      </tr>`).join("")}
    `;
  }).join("");

  // Cost table: cheapest first
  const allModels = [];
  for (const [provider, models] of Object.entries(costs)) {
    for (const [modelId, data] of Object.entries(models)) {
      allModels.push({ provider, modelId, ...data });
    }
  }
  allModels.sort((a, b) => parseFloat(a.totalCost) - parseFloat(b.totalCost));

  const costRows = allModels.map((m, i) => `
    <tr class="${i === 0 ? "cheapest-row" : ""}">
      <td><span class="provider-badge provider-${m.provider}">${m.provider}</span></td>
      <td>${m.label}</td>
      <td class="money">$${m.inputCost}</td>
      <td class="money">$${m.outputCost}</td>
      <td class="money bold">$${m.totalCost}</td>
      <td class="money">${m.perThousandCalls === "0.0000" ? "<$0.01" : "$" + m.perThousandCalls}</td>
    </tr>
  `).join("");

  const warningSection = allWarnings.length === 0
    ? `<div class="no-warnings">No issues found. Clean payload.</div>`
    : allWarnings.map(w => `
        <div class="warning-item">
          <span class="warn-role">${w.role}</span>
          <span class="warn-text">${escHtml(w.warning)}</span>
        </div>`).join("");

  const payloadJson = JSON.stringify(originalPayload, null, 2).slice(0, 2000);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>context-lens report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Berkeley+Mono&family=Syne:wght@400;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0b0c0f;
    --surface: #13151a;
    --surface2: #1c1f27;
    --border: #2a2d38;
    --text: #e8eaf0;
    --muted: #6b7280;
    --accent: #7c6af7;
    --mono: 'Berkeley Mono', 'Fira Code', monospace;
    --sans: 'Syne', sans-serif;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 14px;
    line-height: 1.6;
    padding: 0;
  }

  .header {
    border-bottom: 1px solid var(--border);
    padding: 32px 48px 24px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }

  .logo {
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 4px;
  }

  .logo span { color: var(--accent); }

  h1 {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .generated {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    text-align: right;
  }

  .main { padding: 40px 48px; max-width: 1100px; }

  .score-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 40px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px 24px;
  }

  .stat-label {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .stat-value {
    font-family: var(--mono);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .stat-sub {
    font-size: 12px;
    color: var(--muted);
    margin-top: 4px;
  }

  section { margin-bottom: 40px; }

  h2 {
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  table { width: 100%; border-collapse: collapse; }

  td, th {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }

  th {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface);
  }

  tr:hover td { background: var(--surface2); }

  .role-badge {
    font-family: var(--mono);
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .bar-cell { width: 200px; }

  .bar-wrap {
    background: var(--border);
    border-radius: 3px;
    height: 6px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.6s ease;
  }

  .num-cell, .pct-cell {
    font-family: var(--mono);
    font-size: 12px;
    text-align: right;
    white-space: nowrap;
  }

  .pct-cell { color: var(--muted); }

  .preview-cell {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .warning-row td {
    background: #1a150a;
    border-bottom: 1px solid #2a200a;
    font-size: 12px;
    color: #d97706;
  }

  .warn-icon { margin-right: 6px; }

  .provider-badge {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 4px;
  }

  .provider-anthropic { background: #1a0a2e; color: #a78bfa; }
  .provider-openai { background: #0a1a0a; color: #4ade80; }
  .provider-groq { background: #0a1020; color: #60a5fa; }

  .money { font-family: var(--mono); font-size: 12px; text-align: right; }
  .bold { font-weight: 700; color: var(--text); }

  .cheapest-row td {
    background: #0a1a0a;
    border-bottom: 1px solid #143314;
  }

  .cheapest-row::before { content: "cheapest"; }

  .warning-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid #2a200a;
    border-left: 3px solid #d97706;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .warn-role {
    font-family: var(--mono);
    font-size: 10px;
    padding: 2px 6px;
    background: #2a200a;
    color: #d97706;
    border-radius: 3px;
    white-space: nowrap;
    margin-top: 1px;
  }

  .warn-text { font-size: 13px; color: #fcd34d; }

  .no-warnings {
    padding: 16px;
    background: #0a1a0a;
    border: 1px solid #143314;
    border-radius: 8px;
    color: #4ade80;
    font-family: var(--mono);
    font-size: 12px;
  }

  .payload-block {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: 24px 48px;
    font-size: 11px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer a { color: var(--accent); text-decoration: none; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="logo"><span>◈</span> context-lens</div>
    <h1>Token Analysis Report</h1>
  </div>
  <div class="generated">
    Generated ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC
  </div>
</div>

<div class="main">

  <div class="score-row">
    <div class="stat-card">
      <div class="stat-label">Efficiency score</div>
      <div class="stat-value" style="color:${scoreColor}">${efficiencyScore}</div>
      <div class="stat-sub" style="color:${scoreColor}">${scoreLabel}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total input tokens</div>
      <div class="stat-value">${totalInputTokens.toLocaleString()}</div>
      <div class="stat-sub">${summary.messageCount} message(s) + ${summary.toolCount} tool(s)</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Warnings found</div>
      <div class="stat-value" style="color:${allWarnings.length > 0 ? "#f59e0b" : "#22c55e"}">${allWarnings.length}</div>
      <div class="stat-sub">across all roles</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Token-heaviest role</div>
      <div class="stat-value" style="font-size:20px">${summary.dominantRole}</div>
      <div class="stat-sub">dominates the payload</div>
    </div>
  </div>

  <section>
    <h2>Token breakdown by role</h2>
    <table>
      <thead>
        <tr>
          <th>Role</th>
          <th>Distribution</th>
          <th style="text-align:right">Tokens</th>
          <th style="text-align:right">Share</th>
          <th>Preview</th>
        </tr>
      </thead>
      <tbody>${barRows}</tbody>
    </table>
  </section>

  <section>
    <h2>Cost estimate across providers</h2>
    <table>
      <thead>
        <tr>
          <th>Provider</th>
          <th>Model</th>
          <th style="text-align:right">Input cost</th>
          <th style="text-align:right">Est. output</th>
          <th style="text-align:right">Per call</th>
          <th style="text-align:right">Per 1,000 calls</th>
        </tr>
      </thead>
      <tbody>${costRows}</tbody>
    </table>
    <p style="font-size:11px;color:var(--muted);margin-top:10px">Output estimated at 30% of input tokens. Cheapest option highlighted.</p>
  </section>

  <section>
    <h2>Warnings &amp; recommendations</h2>
    ${warningSection}
  </section>

  <section>
    <h2>Original payload (truncated)</h2>
    <div class="payload-block">${escHtml(payloadJson)}</div>
  </section>

</div>

<div class="footer">
  <span>context-lens — open source token debugger</span>
  <span>github.com/your-handle/context-lens</span>
</div>

</body>
</html>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
