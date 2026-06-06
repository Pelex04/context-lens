// context-lens — rules engine
// Deterministic, zero-cost system prompt optimization
// Runs before Groq to handle all mechanical waste

export function applyRules(text) {
  const changes = [];
  let result = text;

  // 1. Remove duplicate "you are a helpful assistant" style openers
  const helpfulPattern = /you are a helpful(,? and)? (knowledgeable(,? and)?)?(friendly(,? and)?)? ?assistant\.?\s*/gi;
  const helpfulMatches = result.match(helpfulPattern) || [];
  if (helpfulMatches.length > 1) {
    let first = true;
    result = result.replace(helpfulPattern, (match) => {
      if (first) { first = false; return match; }
      return "";
    });
    changes.push(`Removed ${helpfulMatches.length - 1} duplicate "helpful assistant" phrase(s)`);
  }

  // 2. Remove "As an AI language model" filler
  const aiModelPattern = /as an ai (language model|assistant),?\s*/gi;
  if (aiModelPattern.test(result)) {
    result = result.replace(aiModelPattern, "");
    changes.push('Stripped "As an AI language model" filler');
  }

  // 3. Collapse excessive blank lines (3+ newlines → 2)
  const beforeBlanks = (result.match(/\n{3,}/g) || []).length;
  if (beforeBlanks > 0) {
    result = result.replace(/\n{3,}/g, "\n\n");
    changes.push(`Collapsed ${beforeBlanks} excessive blank line block(s)`);
  }

  // 4. Compress verbose phrase patterns
  const verbosePhrases = [
    [/\bin order to\b/gi, "to"],
    [/\bat this point in time\b/gi, "now"],
    [/\bplease make sure to\b/gi, "ensure"],
    [/\bplease ensure that you\b/gi, "ensure you"],
    [/\bit is important (that|to)\b/gi, ""],
    [/\bplease note that\b/gi, "note:"],
    [/\bdue to the fact that\b/gi, "because"],
    [/\bin the event that\b/gi, "if"],
    [/\bfor the purpose of\b/gi, "for"],
    [/\bwith regard to\b/gi, "regarding"],
    [/\bin addition to this\b/gi, "also"],
    [/\bfeel free to\b/gi, ""],
    [/\bdo not hesitate to\b/gi, ""],
    [/\bkindly\b/gi, "please"],
    [/\bultilize\b/gi, "use"],
    [/\bcommence\b/gi, "start"],
    [/\bterminate\b/gi, "end"],
  ];

  let verboseCount = 0;
  for (const [pattern, replacement] of verbosePhrases) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) verboseCount++;
  }
  if (verboseCount > 0) {
    changes.push(`Compressed ${verboseCount} verbose phrase pattern(s)`);
  }

  // 5. Deduplicate near-identical sentences
  const sentences = result.split(/(?<=[.!?])\s+/);
  const seen = new Map();
  const deduped = [];
  let dupeCount = 0;

  for (const sentence of sentences) {
    const normalized = sentence.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
    if (normalized.length < 20) { deduped.push(sentence); continue; }

    let isDupe = false;
    for (const [seenNorm] of seen) {
      if (similarity(normalized, seenNorm) > 0.85) {
        isDupe = true;
        dupeCount++;
        break;
      }
    }
    if (!isDupe) {
      seen.set(normalized, sentence);
      deduped.push(sentence);
    }
  }

  if (dupeCount > 0) {
    result = deduped.join(" ");
    changes.push(`Removed ${dupeCount} near-duplicate sentence(s)`);
  }

  // 6. Strip trailing whitespace from lines
  const beforeTrailing = result;
  result = result.replace(/[ \t]+$/gm, "");
  if (result !== beforeTrailing) {
    changes.push("Stripped trailing whitespace from lines");
  }

  // 7. Detect format instructions that belong in user message
  const formatInstructions = [];
  const formatPatterns = [
    /respond (only |always )?(in|using) (json|markdown|bullet points?|numbered lists?)/gi,
    /always format (your )?responses? as/gi,
    /output (must be|should be) in/gi,
  ];
  for (const pattern of formatPatterns) {
    const matches = result.match(pattern);
    if (matches) formatInstructions.push(...matches);
  }

  return {
    optimized: result.trim(),
    changes,
    formatInstructions,
  };
}

// Simple Jaccard similarity for sentence deduplication
function similarity(a, b) {
  const setA = new Set(a.split(" "));
  const setB = new Set(b.split(" "));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
