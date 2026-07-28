// Is $10 the margin-maintaining pack price? Solve it, don't guess.
// MoR fee (Lemon Squeezy/Polar): 5% + $0.50. Plus LLM cost per artifact.
const PCT = 0.05, FIXED = 0.50;
const fee = p => PCT*p + FIXED;
const net = p => p - fee(p);
// LLM cost: a "pack" of 3 decks costs 3× deck generation.
const COST_DECK = 0.056;
const usd = n => '$'+n.toFixed(2);
const pctS = n => (n*100).toFixed(1)+'%';

console.log('MARGIN ANALYSIS — what price actually maintains margin?\n');
console.log('Fee = 5% + $0.50 (Lemon Squeezy). "Margin kept" = (net − LLM cost) / price.\n');

function analyze(label, price, decks) {
  const llm = decks * COST_DECK;
  const n = net(price);
  const margin = n - llm;              // dollars you actually keep
  const marginPct = margin / price;    // as % of sticker
  const effFee = fee(price)/price;
  return { label, price, decks, llm, net:n, margin, marginPct, effFee };
}

console.log('product'.padEnd(22) + 'price'.padStart(7) + 'fee%'.padStart(8) +
  'net'.padStart(8) + 'LLM'.padStart(7) + 'keep$'.padStart(8) + 'keep%'.padStart(8));
console.log('─'.repeat(68));
const rows = [
  analyze('3-deck pack @ $4.99', 4.99, 3),
  analyze('3-deck pack @ $7', 7, 3),
  analyze('3-deck pack @ $9', 9, 3),
  analyze('3-deck pack @ $10', 10, 3),
  analyze('3-deck pack @ $12', 12, 3),
  analyze('$19 term (≈3 decks use)', 19, 3),
  analyze('$19 term (heavy, 8 decks)', 19, 8),
];
for (const r of rows) {
  console.log(
    r.label.padEnd(22) + usd(r.price).padStart(7) + pctS(r.effFee).padStart(8) +
    usd(r.net).padStart(8) + usd(r.llm).padStart(7) +
    usd(r.margin).padStart(8) + pctS(r.marginPct).padStart(8)
  );
}

console.log('\n── Solve: minimum pack price for a target "keep %" ──');
// marginPct = (0.95p - 0.50 - llm)/p >= target
// 0.95 - (0.50+llm)/p >= target  ->  p >= (0.50+llm)/(0.95-target)
const llm3 = 3*COST_DECK;
for (const target of [0.80, 0.85, 0.90]) {
  const minP = (0.50 + llm3) / (0.95 - target);
  console.log(`  to KEEP >= ${pctS(target)} of a 3-deck pack: price must be >= ${usd(minP)}`);
}

console.log('\n── The cannibalization angle: pack vs term per-deck value ──');
console.log('If a user only ever buys packs and never the term, what do YOU make');
console.log('vs. if they bought the term? (per "deck consumed")');
const packNetPerDeck10 = net(10)/3;
const termNetPerDeck = net(19)/3;   // assuming term-holder makes ~3 decks
console.log(`  $10 pack:  ${usd(net(10))} net / 3 decks = ${usd(packNetPerDeck10)}/deck`);
console.log(`  $19 term:  ${usd(net(19))} net / 3 decks = ${usd(termNetPerDeck)}/deck`);
console.log(`  → a $10-pack-only user is worth ${pctS(packNetPerDeck10/termNetPerDeck)} of a term user PER DECK.`);
console.log('  BUT the term also REPURCHASES next season (22%). A pack is one-and-done');
console.log('  unless they rebuy. Repurchase is where the term pulls ahead long-term.');

console.log('\n── Break-even & the $20-30k target (rough) ──');
const targetRev = 25000;
const netPerTerm = net(19);
const salesNeeded = Math.round(targetRev / netPerTerm);
console.log(`  $25k/yr ÷ ${usd(netPerTerm)} net/term = ~${salesNeeded} paying sales/year`);
console.log(`  at 2.6% conversion → ~${Math.round(salesNeeded/0.026).toLocaleString()} signups/year needed`);
console.log(`  at 4% conversion   → ~${Math.round(salesNeeded/0.04).toLocaleString()} signups/year needed`);
