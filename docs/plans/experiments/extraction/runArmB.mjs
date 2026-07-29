#!/usr/bin/env node
/**
 * Arm B — LLM findings extraction (experiment harness, NOT product code).
 *
 * Reads a paper's text.md, asks an LLM to return ranked findings each with a
 * VERBATIM sourceQuote, gates every finding on verbatim-quote presence, and
 * writes papers/<PAPER>/findings.B.json in the common shape (see shape.md).
 *
 *   node runArmB.mjs <PAPER>      # e.g. node runArmB.mjs EXAMPLE
 *
 * SAFETY: the real LLM call is isolated behind the EXTRACTION_LLM_LIVE flag and
 * only runs when you explicitly opt in. With the flag unset (the default) a
 * deterministic STUB response is used, so the harness runs offline and this
 * script never touches the network or prod. The key is read from OPENAI_API_KEY
 * at call time — never hard-coded, never committed.
 *
 * This is a throwaway experiment spike. If Arm B wins, the LLM extraction layer
 * is built properly from the spec (apps/api), not lifted from here.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// The model + tool the REAL call would use — mirrors the shipped condense
// provider (apps/api/src/narrative/condense.ts + config.ts). Recorded so the
// output's meta.model is honest even while stubbed.
const ARM_B_MODEL = 'gpt-5.6-terra';
const EXTRACT_TOOL_NAME = 'extract_findings';

/** Collapse whitespace, trim, lowercase — the normalization the verbatim gate
 *  and the scorer both use. Keep this identical to score.mjs `norm()`. */
function norm(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Verbatim-quote presence gate: is `quote` a substring of `text` after
 *  whitespace normalization? Empty quote never passes. */
function quoteIsVerbatim(quote, normalizedText) {
  const q = norm(quote);
  if (q.length === 0) return false;
  return normalizedText.includes(q);
}

/**
 * STUB LLM response. Deterministic — no Date.now()/Math.random(). Shaped exactly
 * like the parsed tool-call arguments the real call returns: an array of raw
 * findings. One finding (rank 4) carries a quote that is NOT in text.md so the
 * verbatim gate visibly drops it and droppedForMissingQuote is exercised.
 *
 * This stub is intentionally paper-agnostic in structure but its quotes are
 * written to match papers/EXAMPLE/text.md. For a real bake-off you set the live
 * flag; the stub is only to make the pipeline runnable.
 */
function stubLlmFindings() {
  return {
    findings: [
      {
        text: 'A single restricted night produces a large next-day declarative-memory deficit.',
        sourceQuote:
          'Restricted sleepers recalled fewer word pairs than normal sleepers the next morning',
        sourceSection: 'Results',
        rank: 1,
      },
      {
        text: 'The deficit scales with how much slow-wave sleep was lost.',
        sourceQuote:
          'The size of the memory deficit tracked the amount of slow-wave sleep obtained',
        sourceSection: 'Results',
        rank: 2,
      },
      {
        text: 'The effect is specific to memory, not general alertness.',
        sourceQuote:
          'A control test of simple reaction time showed no group difference the next morning (p = .48)',
        sourceSection: 'Results',
        rank: 3,
      },
      {
        // INVENTED quote — not present in text.md. The gate MUST drop this.
        text: 'Restriction also halved participants’ working-memory span.',
        sourceQuote: 'working-memory span fell by half under restriction',
        sourceSection: 'Results',
        rank: 4,
      },
    ],
  };
}

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  REAL gpt-5.6-terra FORCED-TOOL CALL PLUGS IN HERE.                        │
 * │  Runs ONLY when EXTRACTION_LLM_LIVE is set. Mirrors condense.ts:           │
 * │  POST {baseUrl}/chat/completions with tools:[{type:'function',            │
 * │  function:{name:'extract_findings', parameters: EXTRACT_TOOL_SCHEMA}}]     │
 * │  and tool_choice forcing that function; parse                             │
 * │  choices[0].message.tool_calls[0].function.arguments as JSON.             │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
async function callRealLlm(paperText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'EXTRACTION_LLM_LIVE is set but OPENAI_API_KEY is not. Refusing to call the LLM.',
    );
  }
  // TODO(bake-off): implement the forced-tool-use request below. Left unimplemented
  // on purpose so a stray env flag cannot silently spend money or hit prod. Shape:
  //
  //   const res = await fetch(`${baseUrl}/v1/chat/completions`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  //     body: JSON.stringify({
  //       model: ARM_B_MODEL,
  //       messages: [{ role: 'system', content: EXTRACT_SYSTEM_PROMPT },
  //                  { role: 'user', content: paperText }],
  //       tools: [{ type: 'function', function: {
  //         name: EXTRACT_TOOL_NAME, description: 'Emit ranked findings, each with a verbatim sourceQuote.',
  //         parameters: EXTRACT_TOOL_SCHEMA } }],
  //       tool_choice: { type: 'function', function: { name: EXTRACT_TOOL_NAME } },
  //     }),
  //   });
  //   const payload = await res.json();
  //   return JSON.parse(payload.choices[0].message.tool_calls[0].function.arguments);
  void paperText;
  throw new Error(
    'callRealLlm is not implemented in the scaffold. Implement the forced-tool ' +
      'request (see the block above) before running the live bake-off.',
  );
}

/** Get raw findings from the LLM (or the stub). Records wall-time latency. */
async function extract(paperText) {
  const live = process.env.EXTRACTION_LLM_LIVE === '1';
  const startNs = process.hrtime.bigint();
  const raw = live ? await callRealLlm(paperText) : stubLlmFindings();
  const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
  return { raw, latencyMs, live };
}

/** Apply the verbatim-quote presence gate and re-rank contiguously by rank. */
function gate(rawFindings, paperText) {
  const normalizedText = norm(paperText);
  const kept = [];
  let dropped = 0;
  // Preserve the model's intended importance order via `rank`.
  const byRank = [...rawFindings].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  for (const f of byRank) {
    if (quoteIsVerbatim(f.sourceQuote, normalizedText)) {
      kept.push({
        text: String(f.text ?? ''),
        sourceQuote: String(f.sourceQuote ?? ''),
        sourceSection: String(f.sourceSection ?? ''),
        rank: kept.length + 1, // re-rank contiguous after drops
      });
    } else {
      dropped += 1;
    }
  }
  return { kept, dropped };
}

async function main() {
  const paper = process.argv[2];
  if (!paper) {
    console.error('usage: node runArmB.mjs <PAPER>   (e.g. EXAMPLE)');
    process.exit(2);
  }
  const paperDir = join(HERE, 'papers', paper);
  const textPath = join(paperDir, 'text.md');

  let paperText;
  try {
    paperText = await readFile(textPath, 'utf8');
  } catch (err) {
    console.error(`Cannot read ${textPath}: ${err.message}`);
    process.exit(1);
  }

  let raw, latencyMs, live;
  try {
    ({ raw, latencyMs, live } = await extract(paperText));
  } catch (err) {
    console.error(`Arm B extraction failed for ${paper}: ${err.message}`);
    process.exit(1);
  }

  const findingsArray = Array.isArray(raw?.findings) ? raw.findings : [];
  const { kept, dropped } = gate(findingsArray, paperText);

  const out = {
    paper,
    arm: 'B',
    model: ARM_B_MODEL,
    stub: !live, // true when the deterministic stub produced these findings
    findings: kept,
    meta: {
      latencyMs: Math.round(latencyMs * 1000) / 1000,
      costUsd: 0, // filled by the real call from usage; 0 while stubbed
      droppedForMissingQuote: dropped,
    },
  };

  const outPath = join(paperDir, 'findings.B.json');
  await writeFile(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.error(
    `Arm B ${live ? '(LIVE)' : '(STUB)'} ${paper}: kept ${kept.length}, ` +
      `dropped ${dropped} for missing verbatim quote -> ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
