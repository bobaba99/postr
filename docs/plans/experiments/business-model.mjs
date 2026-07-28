/**
 * Postr business model — unit economics AND fixed costs.
 *
 * The per-deck margin experiment (condense-cost-model.mjs) answered "does a
 * sale make money". It does: ~98%. That is the wrong question on its own,
 * because it ignores the two things that actually decide viability:
 *   1. how many free users become paying ones (conversion)
 *   2. the fixed hosting bill that must be cleared before profit exists
 *
 * All inputs are measured or sourced; assumptions are labelled ASSUMPTION.
 */

// ── MEASURED: per-unit LLM cost ────────────────────────────────────
// From the bake-off: top tier for first generation (non-negotiable — cheap
// tiers failed fidelity 4/4), cheap+cached for iterations.
const COST_DECK_TYPICAL = 0.0560;   // top-tier gen + 3 cached iters + theme
const COST_DECK_WORST   = 0.0917;   // + 6 iters
const COST_POSTER       = 0.0139;   // condense only, luna+cache, 3 iters

// ── DECIDED: pricing (2026-07-28) ──────────────────────────────────
// Two paid things, not a monthly subscription:
//   1. The $19 / 4-month TERM. Unlocks the paywalled outputs — clean
//      editable exports (PPTX + LaTeX, no watermark) AND paper→
//      presentation deck generation. Framed as a term, never a sub:
//      it expires without a cancellation event (growth-plan §2).
//   2. The $4.99 / 3-decks PACK. Per-artifact credit for deck
//      generation, for users who want decks without the full term.
// FREE tier keeps unlimited editing, all tools, and a watermarked PDF
// export ("made with postr.sh") plus paper→poster. What you pay for is
// the clean editable export and the presentation.
const PRICE_TERM  = 18.99;   // $18.99 / 4-month term = $4.75/mo (student ceiling)
const TERM_MONTHS = 4;
const PRICE_PACK  = 9.99;    // $9.99 / 3-deck pack (raised from $4.99: clears fee trap, still recruits)
const PACK_DECKS  = 3;
const stripe = (r) => r * 0.029 + 0.30;

// ── SOURCED: hosting. Vercel Pro $20/seat, Supabase Pro $25 (+usage,
//    typical $35-75 all-in), Render web service $7 starter / $25 pro.
//    Three scenarios rather than one number, because this scales. ──
const HOSTING = {
  lean:   { vercel: 20, supabase: 25, render:  7, label: 'launch (Vercel Pro + Supabase Pro + Render starter)' },
  real:   { vercel: 20, supabase: 45, render: 25, label: 'growing (Supabase usage fees + Render pro)' },
  scaled: { vercel: 60, supabase: 75, render: 85, label: 'scaled (bandwidth + 4GB service)' },
};
const hostingTotal = (h) => h.vercel + h.supabase + h.render;

// ── SOURCED: freemium conversion benchmarks (2026) ─────────────────
// Median 8% across 200 B2B products, but bimodal: a quarter convert <2.5%,
// a quarter 10-15%. Freemium self-serve average 5.6%; 3-5% "good".
// Postr's audience is students/postdocs with low willingness to pay and a
// seasonal, one-off need — so the LOW end is the honest planning number.
const CONVERSION = {
  pessimistic: 0.010,  // 1.0% — below the bottom quartile; plan for this
  low:         0.025,  // 2.5% — bottom-quartile boundary
  median:      0.056,  // 5.6% — freemium self-serve average
  good:        0.080,  // 8.0% — survey median
};

// ASSUMPTION: mix of term-buyers vs pack-buyers among converters, and usage.
// A converter buys EITHER the $19 term (unlocks clean exports + decks) OR a
// $4.99 deck pack. The term is amortised to a monthly figure over its 4-month
// life so the monthly P&L is apples-to-apples.
const TERM_SHARE = 0.4;          // ASSUMPTION: 40% buy the term, 60% the pack
const DECKS_PER_TERM_MONTH = 3;  // ASSUMPTION: term-buyer deck cadence
// Free-tier variable cost: paper→poster still runs the condense pipeline for
// the users who use it. Watermarked PDF export itself is zero marginal cost
// (browser-side), so the free LLM line is the poster pipeline only.
const FREE_GENERATE_SHARE = 0.30; // ASSUMPTION: 30% of free users run the pipeline

const usd = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);

function monthlyModel(mau, convRate, hosting) {
  const converters = mau * convRate;
  const termBuyers = converters * TERM_SHARE;
  const packs = converters * (1 - TERM_SHARE);

  // The $19 term is a one-time charge amortised across its 4 months.
  const termRevMonthly = termBuyers * (PRICE_TERM - stripe(PRICE_TERM)) / TERM_MONTHS;
  const packRev = packs * (PRICE_PACK - stripe(PRICE_PACK));
  const revenue = termRevMonthly + packRev;

  // Variable cost: term-buyers generate decks each month; pack-buyers spend
  // their 3 decks; free users cost the poster condense path only.
  const varCost =
    termBuyers * DECKS_PER_TERM_MONTH * COST_DECK_TYPICAL +
    packs * PACK_DECKS * COST_DECK_TYPICAL +
    (mau - converters) * COST_POSTER * FREE_GENERATE_SHARE;

  const fixed = hostingTotal(hosting);
  return { mau, converters, revenue, varCost, fixed, profit: revenue - varCost - fixed };
}

console.log('POSTR BUSINESS MODEL — unit economics + fixed costs\n');
console.log('Inputs: deck $%s typical / $%s worst · poster $%s · term $%s/%dmo · pack $%s for %d',
  COST_DECK_TYPICAL.toFixed(4), COST_DECK_WORST.toFixed(4), COST_POSTER.toFixed(4),
  PRICE_TERM.toFixed(2), TERM_MONTHS, PRICE_PACK.toFixed(2), PACK_DECKS);
console.log('Hosting: lean $%d/mo · real $%d/mo · scaled $%d/mo',
  hostingTotal(HOSTING.lean), hostingTotal(HOSTING.real), hostingTotal(HOSTING.scaled));
console.log('Conversion benchmarks: median 8%, freemium self-serve avg 5.6%, bottom quartile <2.5%\n');

console.log('═'.repeat(78));
console.log('A. BREAK-EVEN: monthly active users needed to cover hosting');
console.log('═'.repeat(78));
console.log('conversion'.padEnd(14) + ['lean', 'real', 'scaled'].map(s => s.padStart(20)).join(''));
for (const [name, rate] of Object.entries(CONVERSION)) {
  let row = `${name} (${(rate * 100).toFixed(1)}%)`.padEnd(14);
  for (const key of ['lean', 'real', 'scaled']) {
    let mau = 0;
    while (mau < 2_000_000) {
      mau += 100;
      if (monthlyModel(mau, rate, HOSTING[key]).profit > 0) break;
    }
    row += (mau >= 2_000_000 ? 'never' : mau.toLocaleString() + ' MAU').padStart(20);
  }
  console.log(row);
}

console.log('\n' + '═'.repeat(78));
console.log('B. MONTHLY P&L at realistic traffic (hosting: real, $%d/mo)', hostingTotal(HOSTING.real));
console.log('═'.repeat(78));
console.log('MAU'.padEnd(10) + 'conv'.padEnd(8) + 'payers'.padStart(8) +
  'revenue'.padStart(11) + 'llm'.padStart(9) + 'hosting'.padStart(9) + 'profit'.padStart(11));
for (const mau of [500, 2_000, 5_000, 10_000, 25_000, 50_000]) {
  for (const [name, rate] of Object.entries(CONVERSION)) {
    if (name !== 'pessimistic' && name !== 'median') continue;
    const m = monthlyModel(mau, rate, HOSTING.real);
    console.log(
      mau.toLocaleString().padEnd(10) +
      `${(rate * 100).toFixed(1)}%`.padEnd(8) +
      Math.round(m.converters).toString().padStart(8) +
      usd(m.revenue).padStart(11) + usd(m.varCost).padStart(9) +
      usd(m.fixed).padStart(9) + usd(m.profit).padStart(11)
    );
  }
}

console.log('\n' + '═'.repeat(78));
console.log('C. WHAT DOMINATES THE COST? (at 10,000 MAU, median conversion, real hosting)');
console.log('═'.repeat(78));
{
  const m = monthlyModel(10_000, CONVERSION.median, HOSTING.real);
  const total = m.varCost + m.fixed;
  console.log(`LLM (variable)  ${usd(m.varCost).padStart(9)}  ${(100 * m.varCost / total).toFixed(1)}% of cost`);
  console.log(`Hosting (fixed) ${usd(m.fixed).padStart(9)}  ${(100 * m.fixed / total).toFixed(1)}% of cost`);
  // Term Stripe fee is charged once at purchase; shown per-month here to
  // match the amortised revenue line above (fee/TERM_MONTHS).
  const stripeTotal =
    m.converters * TERM_SHARE * stripe(PRICE_TERM) / TERM_MONTHS +
    m.converters * (1 - TERM_SHARE) * stripe(PRICE_PACK);
  console.log(`Stripe fees     ${usd(stripeTotal).padStart(9)}  (already netted out of revenue above)`);
}

console.log('\n' + '═'.repeat(78));
console.log('D. LIFETIME VALUE vs the cost to serve one converter');
console.log('═'.repeat(78));
{
  // Term buyer: one $19 charge, decks consumed across the 4-month term.
  const ltvTerm =
    PRICE_TERM - stripe(PRICE_TERM) - TERM_MONTHS * DECKS_PER_TERM_MONTH * COST_DECK_TYPICAL;
  const ltvPack = PRICE_PACK - stripe(PRICE_PACK) - PACK_DECKS * COST_DECK_TYPICAL;
  console.log(`term buyer LTV ($19, ${TERM_MONTHS}mo @ ${DECKS_PER_TERM_MONTH} decks/mo): ${usd(ltvTerm)}`);
  console.log(`pack buyer LTV (one purchase):        ${usd(ltvPack)}`);
  const blended = TERM_SHARE * ltvTerm + (1 - TERM_SHARE) * ltvPack;
  console.log(`blended LTV per converter:            ${usd(blended)}`);
  console.log(`\nCAC ceiling: with organic-only acquisition CAC ~= $0, so any conversion is`);
  console.log(`profitable per-unit. Paid acquisition only works below ${usd(blended)} per converter,`);
  console.log(`i.e. below ${usd(blended * CONVERSION.median)} per free signup at median conversion.`);
}

console.log('\n' + '═'.repeat(78));
console.log('E. THE FREE TIER IS NOT FREE');
console.log('═'.repeat(78));
for (const mau of [1_000, 10_000, 50_000]) {
  const freeCost = mau * 0.70 * COST_POSTER * 0.30;
  console.log(`${mau.toLocaleString().padStart(6)} MAU -> free-tier LLM spend ${usd(freeCost).padStart(8)}/mo ` +
    `(${usd(freeCost + hostingTotal(HOSTING.real))} with hosting)`);
}
console.log('\nThe poster tool is free and calls a model. At scale that is a real line item,');
console.log('and it is the strongest argument for keeping the free path deterministic where');
console.log('possible (the chart chooser already is — zero marginal cost).');
