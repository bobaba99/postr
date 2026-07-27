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

// ── SOURCED: pricing (2026) ────────────────────────────────────────
const PRICE_SUB   = 7.00;
const PRICE_PACK  = 4.99;
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

// ASSUMPTION: mix of subscription vs pack among converters, and usage.
const SUB_SHARE = 0.4;          // ASSUMPTION: 40% subscribe, 60% buy the pack
const DECKS_PER_SUB_MONTH = 3;  // ASSUMPTION: typical academic cadence
const SUB_MONTHS = 4;           // ASSUMPTION: churn after ~4 months (seasonal need)

const usd = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);

function monthlyModel(mau, convRate, hosting) {
  const converters = mau * convRate;
  const subs = converters * SUB_SHARE;
  const packs = converters * (1 - SUB_SHARE);

  const subRev = subs * (PRICE_SUB - stripe(PRICE_SUB));
  const packRev = packs * (PRICE_PACK - stripe(PRICE_PACK));
  const revenue = subRev + packRev;

  // Variable cost: paying users generate decks; free users cost the poster
  // condense path (the free tier still calls a model).
  const varCost =
    subs * DECKS_PER_SUB_MONTH * COST_DECK_TYPICAL +
    packs * PACK_DECKS * COST_DECK_TYPICAL +
    (mau - converters) * COST_POSTER * 0.30;  // ASSUMPTION: 30% of free users actually generate

  const fixed = hostingTotal(hosting);
  return { mau, converters, revenue, varCost, fixed, profit: revenue - varCost - fixed };
}

console.log('POSTR BUSINESS MODEL — unit economics + fixed costs\n');
console.log('Inputs: deck $%s typical / $%s worst · poster $%s · sub $%s · pack $%s for %d',
  COST_DECK_TYPICAL.toFixed(4), COST_DECK_WORST.toFixed(4), COST_POSTER.toFixed(4),
  PRICE_SUB.toFixed(2), PRICE_PACK.toFixed(2), PACK_DECKS);
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
  const stripeTotal = m.converters * SUB_SHARE * stripe(PRICE_SUB) + m.converters * (1 - SUB_SHARE) * stripe(PRICE_PACK);
  console.log(`Stripe fees     ${usd(stripeTotal).padStart(9)}  (already netted out of revenue above)`);
}

console.log('\n' + '═'.repeat(78));
console.log('D. LIFETIME VALUE vs the cost to serve one converter');
console.log('═'.repeat(78));
{
  const ltvSub = SUB_MONTHS * (PRICE_SUB - stripe(PRICE_SUB) - DECKS_PER_SUB_MONTH * COST_DECK_TYPICAL);
  const ltvPack = PRICE_PACK - stripe(PRICE_PACK) - PACK_DECKS * COST_DECK_TYPICAL;
  console.log(`subscriber LTV (${SUB_MONTHS} mo @ ${DECKS_PER_SUB_MONTH} decks): ${usd(ltvSub)}`);
  console.log(`pack buyer LTV (one purchase):        ${usd(ltvPack)}`);
  const blended = SUB_SHARE * ltvSub + (1 - SUB_SHARE) * ltvPack;
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
