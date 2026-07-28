/**
 * Founding-cohort cost model — 100 users, 2-year term.
 *
 * Question: is "5 free pipeline runs per semester, $1/run after" a
 * defensible offer for the first 100 users?
 *
 * The brief explicitly is NOT "does this turn a profit". Gavin:
 *   "it's not just a cost to cover, it's the cost of trust and
 *    reputation, I'm willing to accept if this doesn't make money,
 *    I never expected first 100 users to make money in the first place"
 *
 * So the question this answers is narrower and more useful:
 *   1. What is the WORST case exposure? (can it hurt him?)
 *   2. Is the free allowance generous enough to never feel mean?
 *   3. Does $1/run insult anyone, or is it a rounding error either way?
 *
 * ---------------------------------------------------------------
 * MEASURED PARAMETERS (read from the repo 2026-07-28, not assumed)
 * ---------------------------------------------------------------
 *   apps/api/src/app.ts:40      "the one LLM step in the manuscript
 *                                → poster pipeline" — ONE call per run
 *   narrative/config.ts:29      CONDENSER_MODEL = 'gpt-5.6-terra'
 *   narrative/config.ts:33      CONDENSER_MAX_TOKENS = 4096
 *   narrative/config.ts:20      terra = $2.50 in / $15.00 out per 1M
 *
 * Token shape is inherited from condense-cost-model.mjs, which took it
 * from the shipped prompt:
 *   system ~400, emphasis ~120, manuscript ~2500 typical / 5000 max,
 *   output ~520 typical (5 panels x 40-150 words), 4096 hard ceiling.
 *
 * IMPORTANT: the import.ts calls (max_tokens 16_384 etc.) are the
 * POSTER-IMAGE import path, not the manuscript pipeline. Earlier notes
 * in the paywall doc cited 16_384 as the pipeline cost; that was the
 * wrong call site. The pipeline's ceiling is 4096.
 */

const PRICE = { in: 2.5, out: 15.0 }; // gpt-5.6-terra, $ per 1M tokens

// Cached input discount. OpenAI bills cached prefix at a fraction of
// input. ASSUMPTION, flagged: the repo's own cost model uses 0.10 and
// notes it is unverified. Cache only helps on repeat runs of the SAME
// manuscript, which is exactly the iterate-on-my-poster case.
const CACHE_RATE = 0.1;

const TOK = {
  system: 400,
  emphasis: 120,
  manuscriptTypical: 2500,
  manuscriptMax: 5000,
  outputTypical: 520,
  outputMax: 4096, // CONDENSER_MAX_TOKENS — the billing ceiling
};

/** Cost of a single pipeline run, in dollars. */
function runCost({ manuscript, output, cached = false }) {
  const prefix = TOK.system + manuscript;
  const prefixRate = cached ? PRICE.in * CACHE_RATE : PRICE.in;
  return (
    (prefix * prefixRate) / 1e6 +
    (TOK.emphasis * PRICE.in) / 1e6 +
    (output * PRICE.out) / 1e6
  );
}

const usd = (n) => '$' + n.toFixed(4);
const usd2 = (n) => '$' + n.toFixed(2);

console.log('='.repeat(70));
console.log('FOUNDING COHORT COST MODEL — 100 users, 2-year term');
console.log('gpt-5.6-terra @ $2.50 in / $15.00 out per 1M; 1 LLM call per run');
console.log('='.repeat(70));

// ---------------------------------------------------------------
// 1. What one run costs
// ---------------------------------------------------------------
const cheap = runCost({ manuscript: TOK.manuscriptTypical, output: TOK.outputTypical, cached: true });
const typical = runCost({ manuscript: TOK.manuscriptTypical, output: TOK.outputTypical });
const worst = runCost({ manuscript: TOK.manuscriptMax, output: TOK.outputMax });

console.log('\n1. COST OF ONE PIPELINE RUN');
console.log(`   cached repeat (same manuscript) : ${usd(cheap)}`);
console.log(`   typical first run              : ${usd(typical)}`);
console.log(`   worst case (max input + output): ${usd(worst)}`);
console.log(`   -> $1.00 covers ${Math.floor(1 / worst)} worst-case runs,`);
console.log(`      or ${Math.floor(1 / typical)} typical runs.`);

// ---------------------------------------------------------------
// 2. Three scenarios over the 2-year term
// ---------------------------------------------------------------
// A "semester" here = 4 months, so a 2-year term = 6 semesters.
const SEMESTERS = 6;
/**
 * Raised 5 → 10 on 2026-07-28. The first run of this model showed the
 * ENTIRE free allowance for all 100 users over the full two years cost
 * $46 at 5/semester — so the limit was saving nothing while still
 * risking a founding user hitting a wall. 10 keeps the "runs are
 * metered" signal (which matters for the later paid transition) while
 * making it very unlikely a genuine user ever reaches it.
 */
const FREE_RUNS = 10;
const OVERAGE = 1.0;

/**
 * @param label
 * @param activeFrac  share of the 100 who ever run the pipeline
 * @param runsPerSem  runs per semester for an active user
 * @param manuscript  input size
 * @param output      output size
 * @param cacheHit    share of runs that hit a warm cache
 */
function scenario(label, { activeFrac, runsPerSem, manuscript, output, cacheHit }) {
  const users = 100 * activeFrac;
  const totalRuns = users * runsPerSem * SEMESTERS;

  const cachedRuns = totalRuns * cacheHit;
  const coldRuns = totalRuns - cachedRuns;
  const cost =
    cachedRuns * runCost({ manuscript, output, cached: true }) +
    coldRuns * runCost({ manuscript, output });

  // Revenue: only runs beyond the free 5/semester are billed.
  const billablePerUserPerSem = Math.max(0, runsPerSem - FREE_RUNS);
  const revenue = users * billablePerUserPerSem * SEMESTERS * OVERAGE;

  return { label, users, totalRuns, cost, revenue, net: revenue - cost };
}

const scenarios = [
  scenario('BEST — light, cache-friendly use', {
    // Most founding users try it once or twice. Realistic for a tool
    // with no traffic: the pipeline is one feature among many.
    activeFrac: 0.3,
    runsPerSem: 2,
    manuscript: TOK.manuscriptTypical,
    output: TOK.outputTypical,
    cacheHit: 0.5,
  }),
  scenario('AVERAGE — engaged but within the allowance', {
    // Half the cohort uses it, ~4 runs/semester: one poster, a few
    // iterations. Lands just under the free ceiling by design.
    activeFrac: 0.5,
    runsPerSem: 4,
    manuscript: TOK.manuscriptTypical,
    output: TOK.outputTypical,
    cacheHit: 0.4,
  }),
  scenario('WORST — everyone hammers it, no caching, max tokens', {
    // Every one of the 100 runs 20x/semester on max-size manuscripts
    // with zero cache benefit. Deliberately absurd: this is a bound,
    // not a forecast.
    activeFrac: 1.0,
    runsPerSem: 20,
    manuscript: TOK.manuscriptMax,
    output: TOK.outputMax,
    cacheHit: 0,
  }),
];

console.log('\n2. TWO-YEAR TOTALS (6 semesters, 100-user cohort)');
console.log('   ' + '-'.repeat(66));
for (const s of scenarios) {
  console.log(`\n   ${s.label}`);
  console.log(`     active users     : ${s.users}`);
  console.log(`     total runs       : ${s.totalRuns.toLocaleString()}`);
  console.log(`     LLM cost (2yr)   : ${usd2(s.cost)}`);
  console.log(`     overage revenue  : ${usd2(s.revenue)}`);
  console.log(`     net              : ${usd2(s.net)}  (${s.net >= 0 ? 'profit' : 'LOSS'})`);
  console.log(`     cost per month   : ${usd2(s.cost / 24)}`);
}

// ---------------------------------------------------------------
// 3. The question that actually matters: worst-case exposure
// ---------------------------------------------------------------
console.log('\n3. WORST-CASE EXPOSURE — can this hurt?');
const w = scenarios[2];
console.log(`   Absolute worst modelled : ${usd2(w.cost)} over 2 years`);
console.log(`                           = ${usd2(w.cost / 24)}/month`);
console.log(`   That assumes ALL 100 users run 20x/semester on maximum-size`);
console.log(`   manuscripts with zero cache hits, for two years straight.`);

// What would it take to reach a genuinely painful number?
const PAIN = 500; // $/month that would actually sting a solo operator
const runsForPain = PAIN / worst;
console.log(`\n   To reach ${usd2(PAIN)}/month of LLM spend would need`);
console.log(`   ${Math.round(runsForPain).toLocaleString()} worst-case runs/month`);
console.log(`   = ${Math.round(runsForPain / 100)} runs/user/month across all 100.`);

// ---------------------------------------------------------------
// 4. Is the free allowance generous?
// ---------------------------------------------------------------
console.log(`\n4. IS ${FREE_RUNS} RUNS/SEMESTER GENEROUS?`);
const freeCostPerUser = FREE_RUNS * SEMESTERS * typical;
console.log(`   Cost of the full free allowance, per user, over 2 years:`);
console.log(
  `     ${FREE_RUNS} runs x ${SEMESTERS} semesters x ${usd(typical)} = ${usd2(freeCostPerUser)}`,
);
console.log(`   Across all 100 users, if every one exhausted it:`);
console.log(`     ${usd2(freeCostPerUser * 100)} over 2 years = ${usd2((freeCostPerUser * 100) / 24)}/month`);
console.log(`\n   -> Giving all 100 users their FULL allowance for the entire`);
console.log(`      2-year term costs less than a single month of most SaaS.`);

// ---------------------------------------------------------------
// 5. Does $1/run make sense as a price?
// ---------------------------------------------------------------
console.log('\n5. THE $1 OVERAGE PRICE');
console.log(`   Margin at typical cost : ${usd2(OVERAGE - typical)} per run (${((1 - typical / OVERAGE) * 100).toFixed(1)}%)`);
console.log(`   Margin at worst case   : ${usd2(OVERAGE - worst)} per run (${((1 - worst / OVERAGE) * 100).toFixed(1)}%)`);
console.log(`   Break-even price would be ${usd(worst)} — $1 is ${(OVERAGE / worst).toFixed(0)}x that.`);
console.log(`\n   The price is not a cost-recovery instrument. At these`);
console.log(`   margins it is a FRICTION instrument: it exists to stop`);
console.log(`   unbounded automated use, not to fund the service.`);

console.log('\n' + '='.repeat(70));
console.log('NOTES / ASSUMPTIONS (do not quote these as measured)');
console.log('='.repeat(70));
console.log(`
 - Cache discount ${CACHE_RATE} is ASSUMED (per condense-cost-model.mjs);
   the discount RATE is unverified against a live bill.

   The ORDERING prerequisite is now DONE (2026-07-28):
   buildCondenserUserMessage() emits PANELS first and AUTHOR EMPHASIS
   last, so the manuscript is a stable cacheable prefix across a user's
   iterations. Measured 91.2% of the message byte-identical when every
   emphasis field changes (~646 prefix tokens + ~470 system). Before the
   reorder the volatile block sat at byte zero and the cache could never
   hit. narrativePrompt.test.ts now pins the order.

 - Token counts are estimates from the shipped prompt shape, not
   measured from live API responses. Verify against real usage data
   once there is traffic.

 - Model is gpt-5.6-terra today. config.ts flags gpt-5.6-luna
   ($1.00/$6.00) as the next step down pending a quality bake-off,
   which would cut these costs by ~60%.

 - Infrastructure cost (Render, Supabase, Vercel) is NOT modelled here.
   The growth plan puts break-even at ~50 MAU on free tiers, so 100
   users may push one service into a paid band. That is a larger line
   item than the LLM spend in every scenario above.
`);
