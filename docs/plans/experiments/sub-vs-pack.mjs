// Sub-only vs. sub+pack, modeling the SUBSTITUTION mechanic honestly.
// A pack does two opposing things:
//   + captures INCREMENTAL buyers (would pay $0 otherwise) → pure gain
//   − poaches SOME would-be term buyers (substitution) → they pay pack
//     price + repurchase LESS (one-and-done vs term's 22%/season)
// Net effect depends on substitution rate (research: 20/35/55%) and how
// many incremental buyers the cheaper price unlocks.

const PCT=0.05, FIXED=0.50, netFee=p=>p-(PCT*p+FIXED);
const COST_DECK=0.056;
const NET_TERM=netFee(18.99), NET_PACK10=netFee(9.99);  // final pricing 2026-07-28
const usd=n=>(n<0?'-$':'$')+Math.abs(n).toFixed(2);
const pctS=n=>(n*100).toFixed(0)+'%';

// LTV over a 3-year (6-season) horizon.
// Term buyer: buys term, repurchases at R each subsequent season.
// Pack buyer: buys pack, RE-buys pack at some lower cadence (unknown —
//   research gap; assume pack repeat < term repurchase).
const SEASONS = 6;               // ~3 years, 2 poster seasons/yr
const R_TERM = 0.22;             // term repurchase per season [SOLID-ish]
const R_PACK = 0.15;             // pack re-buy per season [ASSUMPTION — lower]

function ltvTerm(){
  let ltv=0, active=1;
  for(let s=0;s<SEASONS;s++){ ltv += active*(NET_TERM - COST_DECK*3); active*=R_TERM + (s===0?1-R_TERM:0)*0; active = s===0?R_TERM:active*1; }
  // simpler geometric: term + R + R^2 + ...
  ltv = 0;
  for(let s=0;s<SEASONS;s++) ltv += Math.pow(R_TERM,s) * (NET_TERM - COST_DECK*3);
  return ltv;
}
function ltvPack(){
  let ltv=0;
  for(let s=0;s<SEASONS;s++) ltv += Math.pow(R_PACK,s) * (NET_PACK10 - COST_DECK*3);
  return ltv;
}
const LTV_TERM = ltvTerm(), LTV_PACK = ltvPack();

console.log('LTV over ~3 years (6 seasons), net of fees + LLM:');
console.log(`  term buyer:  ${usd(LTV_TERM)}  (repurchase ${pctS(R_TERM)}/season)`);
console.log(`  pack buyer:  ${usd(LTV_PACK)}  (re-buy ${pctS(R_PACK)}/season, ASSUMED)`);
console.log(`  a pack buyer is worth ${pctS(LTV_PACK/LTV_TERM)} of a term buyer over 3yr.\n`);

// Now the strategic comparison, per 100 people who WOULD have bought the term.
// SUB-ONLY: all 100 buy the term.
// SUB+PACK: of would-be term buyers, `sub` fraction defect to the pack;
//   AND the pack unlocks `incr` NEW pack buyers who'd have paid $0.
console.log('═'.repeat(66));
console.log('Per 100 would-be TERM buyers + the incremental pack-only crowd');
console.log('═'.repeat(66));
console.log('Assumes for every 100 would-be subscribers, the cheaper pack');
console.log('ALSO unlocks `incr` net-new buyers who would otherwise pay $0.\n');

function scenario(subRate, incrPer100){
  // sub-only baseline
  const subOnly = 100 * LTV_TERM;
  // sub+pack
  const defectors = 100 * subRate;            // buy pack instead of term
  const loyalTerm = 100 - defectors;          // still buy term
  const incremental = incrPer100;             // net-new pack buyers
  const withPack = loyalTerm*LTV_TERM + (defectors+incremental)*LTV_PACK;
  return { subOnly, withPack, delta: withPack-subOnly };
}

console.log('sub-only 3yr value per 100 = ' + usd(100*LTV_TERM) + '\n');
console.log('substitution → '.padEnd(20) + ['20%','35%','55%'].map(s=>s.padStart(13)).join(''));
for(const incr of [10, 30, 60, 100]){
  let row = `+${incr} incremental`.padEnd(20);
  for(const sub of [0.20,0.35,0.55]){
    const r = scenario(sub, incr);
    const sign = r.delta>=0?'+':'';
    row += (sign+usd(r.delta)).padStart(13);
  }
  console.log(row);
}
console.log('\n(cells = 3-yr value change vs sub-only, per 100 would-be subscribers.');
console.log(' POSITIVE = pack helps. The break-even incremental count is what');
console.log(' matters: how many net-new buyers must the pack unlock to pay for');
console.log(' the subscribers it poaches?)\n');

// Break-even incremental: withPack = subOnly
// loyalTerm*LTV_TERM + (defectors+incr)*LTV_PACK = 100*LTV_TERM
// incr = [100*LTV_TERM - loyalTerm*LTV_TERM]/LTV_PACK - defectors
console.log('BREAK-EVEN incremental pack buyers needed (per 100 would-be subs):');
for(const sub of [0.20,0.35,0.55]){
  const defectors=100*sub, loyal=100-defectors;
  const incrBE = (100*LTV_TERM - loyal*LTV_TERM)/LTV_PACK - defectors;
  console.log(`  at ${pctS(sub)} substitution: need >${incrBE.toFixed(0)} net-new pack buyers to come out ahead`);
}
