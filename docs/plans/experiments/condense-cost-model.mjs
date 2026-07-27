/**
 * Condense-cost experiment.
 *
 * Question: with caching, does a pricier model with cheap cache hits beat a
 * cheaper model without, once a user iterates on the SAME manuscript?
 *
 * Structure of one condense call (measured from the repo):
 *   system prompt          ~400 tok   static forever
 *   emphasis block         ~120 tok   CHANGES per iteration (that is the point of iterating)
 *   panel source text      up to 5000 tok (20k char cap); typical ~2500
 *                                     IDENTICAL across iterations of one manuscript
 *   output                 5 panels, 40-150 words each = ~390 words ~= 520 tok
 *
 * Cacheable prefix = system + panel source (the manuscript) IF the request is
 * ordered so the volatile emphasis sits LAST. That ordering is a code change,
 * and it is the whole ballgame — see notes at the bottom.
 */

const PRICES = {
  // $ per 1M tokens
  'gpt-5.6-sol':   { in: 5.00, out: 15.00, cachedIn: null },
  'gpt-5.6-terra': { in: 2.50, out: 15.00, cachedIn: null },
  'gpt-5.6-luna':  { in: 1.00, out:  6.00, cachedIn: null },
  'kimi-k3':       { in: 3.00, out: 15.00, cachedIn: 0.30 },
};

// OpenAI-family caching: assume the standard automatic-prefix-cache discount.
// Recorded as an ASSUMPTION, not a measurement — flagged in the output.
const OPENAI_CACHE_DISCOUNT = 0.10; // cached input billed at 10% of input
for (const k of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
  PRICES[k].cachedIn = +(PRICES[k].in * OPENAI_CACHE_DISCOUNT).toFixed(3);
}

const TOK = {
  system: 400,
  emphasis: 120,
  manuscriptTypical: 2500,
  manuscriptMax: 5000,
  output: 520,
};

const usd = (n) => '$' + n.toFixed(4);

/** Cost of N iterations on ONE manuscript. */
function costFor(model, iterations, manuscriptTok, { caching }) {
  const p = PRICES[model];
  const prefix = TOK.system + manuscriptTok;      // static across iterations
  const volatile = TOK.emphasis;                   // changes every time
  let total = 0;
  for (let i = 0; i < iterations; i++) {
    const firstCall = i === 0;
    const prefixRate = caching && !firstCall ? p.cachedIn : p.in;
    total += (prefix * prefixRate) / 1e6;
    total += (volatile * p.in) / 1e6;
    total += (TOK.output * p.out) / 1e6;
  }
  return total;
}

console.log('CONDENSE COST EXPERIMENT');
console.log('manuscript prefix = ' + TOK.manuscriptTypical + ' tok (typical), output ' + TOK.output + ' tok\n');

const models = Object.keys(PRICES);
const iterCounts = [1, 3, 5, 10];

console.log('--- A. NO CACHING (today: prefix rebilled every call) ---');
console.log('model'.padEnd(15) + iterCounts.map(n => (n + ' iter').padStart(11)).join(''));
for (const m of models) {
  const row = iterCounts.map(n => usd(costFor(m, n, TOK.manuscriptTypical, { caching: false })).padStart(11)).join('');
  console.log(m.padEnd(15) + row);
}

console.log('\n--- B. WITH CACHING (prefix cached after first call) ---');
console.log('model'.padEnd(15) + iterCounts.map(n => (n + ' iter').padStart(11)).join(''));
for (const m of models) {
  const row = iterCounts.map(n => usd(costFor(m, n, TOK.manuscriptTypical, { caching: true })).padStart(11)).join('');
  console.log(m.padEnd(15) + row);
}

console.log('\n--- C. CACHING SAVING per model (5 iterations) ---');
for (const m of models) {
  const off = costFor(m, 5, TOK.manuscriptTypical, { caching: false });
  const on = costFor(m, 5, TOK.manuscriptTypical, { caching: true });
  const pct = ((1 - on / off) * 100).toFixed(1);
  console.log(`${m.padEnd(15)} ${usd(off)} -> ${usd(on)}  (${pct}% cheaper)`);
}

console.log('\n--- D. HEAD TO HEAD: does K3 caching beat luna? ---');
for (const n of iterCounts) {
  const k3 = costFor('kimi-k3', n, TOK.manuscriptTypical, { caching: true });
  const lunaCached = costFor('gpt-5.6-luna', n, TOK.manuscriptTypical, { caching: true });
  const lunaPlain = costFor('gpt-5.6-luna', n, TOK.manuscriptTypical, { caching: false });
  const terraCached = costFor('gpt-5.6-terra', n, TOK.manuscriptTypical, { caching: true });
  console.log(
    `${String(n).padStart(2)} iter | k3+cache ${usd(k3)} | luna+cache ${usd(lunaCached)} | luna raw ${usd(lunaPlain)} | terra+cache ${usd(terraCached)}` +
    `  -> cheapest: ${[['k3',k3],['luna+cache',lunaCached],['luna raw',lunaPlain],['terra+cache',terraCached]].sort((a,b)=>a[1]-b[1])[0][0]}`
  );
}

console.log('\n--- E. LONG MANUSCRIPT (5000 tok cap), 5 iterations ---');
for (const m of models) {
  const on = costFor(m, 5, TOK.manuscriptMax, { caching: true });
  const off = costFor(m, 5, TOK.manuscriptMax, { caching: false });
  console.log(`${m.padEnd(15)} raw ${usd(off)}  cached ${usd(on)}`);
}

console.log('\n--- F. AT SCALE: 1000 users x 3 iterations, cached ---');
for (const m of models) {
  const per = costFor(m, 3, TOK.manuscriptTypical, { caching: true });
  console.log(`${m.padEnd(15)} ${usd(per)}/user -> $${(per * 1000).toFixed(2)} per 1000 users`);
}
