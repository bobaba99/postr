/**
 * Deterministic budget enforcement — the rubric's "no overflow, ever"
 * guarantee. The condenser prompt asks for the budget; this pass
 * ENFORCES it, so a chatty model reply can never overflow a poster
 * panel. Truncation is reported, never silent.
 */

export interface EnforcedText {
  text: string;
  truncated: boolean;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z("'‘“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Clamp `text` to `budgetWords`. Prefers whole-sentence truncation;
 * falls back to a hard word cut with an ellipsis when even the first
 * sentence blows the budget.
 */
export function enforceBudget(text: string, budgetWords: number): EnforcedText {
  const cleaned = text.trim();
  if (countWords(cleaned) <= budgetWords) {
    return { text: cleaned, truncated: false };
  }

  const sentences = splitSentences(cleaned);
  const kept: string[] = [];
  let used = 0;
  for (const sentence of sentences) {
    const words = countWords(sentence);
    if (used + words > budgetWords) break;
    kept.push(sentence);
    used += words;
  }

  if (kept.length > 0) {
    return { text: kept.join(' '), truncated: true };
  }

  // First sentence alone exceeds the budget — hard cut.
  const words = cleaned.split(/\s+/).slice(0, budgetWords);
  return { text: `${words.join(' ')}…`, truncated: true };
}
