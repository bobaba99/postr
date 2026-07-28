/**
 * Postr financial projection — 6-month, 1-year, 3-year balance.
 *
 * A month-by-month simulation, not a single-point estimate, because the
 * two things that dominate this business — seasonality and repurchase —
 * only show up over time. Every benchmark input is sourced in
 * BENCHMARKS.md; assumptions are labelled ASSUMPTION and are the knobs
 * the interactive artifact exposes.
 *
 * The interactive projection artifact runs THIS SAME MATH in the
 * browser. Keep them in sync: `simulate()` here is the reference.
 *
 * HARD TRUTH baked in from the research: Postr is not subscription SaaS.
 * It is an occasion-driven, thin-monetization academic tool. Overleaf's
 * ~$1/user/YEAR ARPU is the north star. The conservative reading of the
 * solid data is the correct one — so the DEFAULTS below are the
 * conservative (EdTech) case, and optimism is something you dial IN, not
 * out.
 */

// ── PRICING (decided 2026-07-28) ───────────────────────────────────
const PRICE_TERM = 18.99;  // $18.99 / 4-month term = $4.75/mo (student ceiling)
const PRICE_PACK = 9.99;   // $9.99 / 3-deck pack (raised from $4.99 to clear the fee trap)
const stripeFee = (r) => r * 0.029 + 0.3;
const NET_TERM = PRICE_TERM - stripeFee(PRICE_TERM); // ~$18.15
const NET_PACK = PRICE_PACK - stripeFee(PRICE_PACK); // ~$4.55

// ── UNIT COST (measured, from business-model.mjs / bake-off) ────────
const COST_DECK = 0.056;    // one paid deck: top-tier gen + cached iters
const COST_POSTER_FREE = 0.0139 * 0.3; // free poster: condense path, 30% of
                                        // free users actually invoke an LLM

// ── HOSTING (sourced; steps up with scale) ─────────────────────────
// Vercel Pro $20, Supabase $25→$75, Render $7→$85. Picked by MAU band.
function hostingFor(mau) {
  if (mau < 2_000) return 52;    // lean: 20 + 25 + 7
  if (mau < 20_000) return 90;   // real: 20 + 45 + 25
  return 220;                    // scaled: 60 + 75 + 85
}

// ── SEASONALITY (phenomenon SOLID, magnitude ASSUMPTION) ───────────
// Gillis & Garrison 2022: academic activity is biphasic, high in
// fall + spring, low in summer/winter break (R²=0.55–0.74). Poster
// deadlines cluster Feb–Apr + Oct. Magnitude is set here, not sourced.
// Index by calendar month (0=Jan). Peak ~2–2.4×, summer ~0.35×.
const SEASON = [
  1.4, 1.9, 2.4, 2.2, 1.1, 0.5, // Jan–Jun  (spring poster season peaks Mar)
  0.35, 0.6, 1.3, 1.8, 1.5, 0.7, // Jul–Dec  (fall season peaks Oct)
];
const seasonAvg = SEASON.reduce((a, b) => a + b, 0) / 12;

// ── DEFAULTS — the conservative EdTech reading (the honest base) ───
export const DEFAULTS = {
  startMonth: 0,           // 0 = Jan launch
  seedSignups: 120,        // ASSUMPTION: month-1 signups (a first campus)
  organicGrowth: 0.05,     // 5% MoM underlying, BEFORE seasonality (research: 3–7%)
  conversion: 0.026,       // 2.6% free→paid — EdTech, First Page Sage 2026 (SOLID)
  termShare: 0.55,         // ASSUMPTION: of payers, 55% buy the term, 45% the pack
  repurchase: 0.22,        // 22% buy again next season — RevenueCat edu 24% (SOLID)
  packAttach: 0.12,        // 12% of term buyers also grab a pack — INFERENCE
  decksPerTermMonth: 1.5,  // ASSUMPTION: paid decks a term-holder makes / month
  foundingThreshold: 0,    // 0 = OFF (everyone pays). Set >0 to grandfather
                           // the first N users to the free founding benefit.
};

/**
 * Run the month-by-month simulation.
 * Returns an array of monthly rows with cumulative balance.
 */
export function simulate(months, opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  const rows = [];

  let signupsPrev = p.seedSignups;
  let totalUsers = 0;
  let cumBalance = 0;
  // Payers who bought this season and MAY repurchase next peak.
  let returningPool = 0;

  for (let m = 0; m < months; m++) {
    const cal = (p.startMonth + m) % 12;
    const season = SEASON[cal];

    // New signups: organic compounding trend, modulated by season.
    // Month 0 uses the seed; after that it grows off the *deseasonalised*
    // trend so the seasonal swing doesn't compound into the base.
    const trend = p.seedSignups * Math.pow(1 + p.organicGrowth, m);
    const newSignups = m === 0 ? p.seedSignups : Math.round((trend * season) / seasonAvg);
    signupsPrev = newSignups;
    const usersBefore = totalUsers;
    totalUsers += newSignups;

    // Founding cohort: users below the threshold never pay (retroactive
    // grant — the P&L just sees no revenue from them). Gated per USER, so
    // the month that CROSSES the threshold is split: only the signups
    // above the line pay. An all-or-nothing per-month check would never
    // fire when month 1 already exceeds the threshold.
    const payingSignups =
      p.foundingThreshold > 0
        ? Math.max(0, totalUsers - Math.max(usersBefore, p.foundingThreshold))
        : newSignups;

    // Conversion happens near the artifact moment, which is seasonal —
    // a deadline is what makes someone pay. Scale conversion by season,
    // capped so a big peak can't push it past a sane ceiling.
    const seasonalConv = Math.min(p.conversion * season, 0.12);
    const newConverters = payingSignups * seasonalConv;

    // Repurchase: a slice of prior payers buy again, concentrated in peak
    // months (season>1.2). Models "back for the next poster season".
    const repurchasers = season > 1.2 ? returningPool * p.repurchase : 0;
    returningPool = returningPool - repurchasers + newConverters + repurchasers;

    const converters = newConverters + repurchasers;
    const termBuyers = converters * p.termShare;
    const packBuyers = converters * (1 - p.termShare);
    const packAttachBuyers = termBuyers * p.packAttach;

    // Revenue (net of Stripe).
    const revTerm = termBuyers * NET_TERM;
    const revPack = (packBuyers + packAttachBuyers) * NET_PACK;
    const revenue = revTerm + revPack;

    // Variable cost: paid decks (term holders generate ~decksPerTermMonth;
    // pack buyers spend 3 decks once) + the free-tier LLM spend.
    const activeTermHolders = returningPool * p.termShare;
    const deckCost =
      activeTermHolders * p.decksPerTermMonth * COST_DECK +
      packBuyers * 3 * COST_DECK;
    const freeCost = (totalUsers - converters) * COST_POSTER_FREE * (season / seasonAvg);
    const hosting = hostingFor(totalUsers);
    const cost = deckCost + freeCost + hosting;

    const profit = revenue - cost;
    cumBalance += profit;

    rows.push({
      month: m + 1,
      calLabel: MONTHS_ABBR[cal],
      season,
      newSignups,
      totalUsers,
      converters: Math.round(converters),
      revenue,
      cost,
      hosting,
      profit,
      cumBalance,
    });
  }
  return rows;
}

const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── CLI: print the 6mo / 1yr / 3yr summary ─────────────────────────
function fmt(n) {
  const s = Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(0);
  return (n < 0 ? '-$' : '$') + s.replace('-', '');
}

function summary(label, rows) {
  const last = rows[rows.length - 1];
  const rev = rows.reduce((a, r) => a + r.revenue, 0);
  const cost = rows.reduce((a, r) => a + r.cost, 0);
  console.log(
    `${label.padEnd(10)} users ${last.totalUsers.toLocaleString().padStart(8)}  ` +
    `revenue ${fmt(rev).padStart(10)}  cost ${fmt(cost).padStart(9)}  ` +
    `balance ${fmt(last.cumBalance).padStart(11)}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('POSTR FINANCIAL PROJECTION — conservative EdTech base case\n');
  console.log('Pricing: $19/4mo term, $4.99/3-deck pack · conversion 2.6% (EdTech)');
  console.log('Repurchase 22% · organic 5% MoM · seasonal peaks Mar & Oct\n');
  console.log('─'.repeat(72));
  for (const [label, n] of [['6 months', 6], ['1 year', 12], ['3 years', 36]]) {
    summary(label, simulate(n));
  }
  console.log('─'.repeat(72));

  console.log('\nSENSITIVITY — 3-year ending balance across conversion × repurchase:');
  console.log('conv\\repurch'.padEnd(14) + ['10%', '22%', '35%'].map((s) => s.padStart(12)).join(''));
  for (const conv of [0.015, 0.026, 0.04]) {
    let row = `${(conv * 100).toFixed(1)}%`.padEnd(14);
    for (const rep of [0.1, 0.22, 0.35]) {
      const r = simulate(36, { conversion: conv, repurchase: rep });
      row += fmt(r[r.length - 1].cumBalance).padStart(12);
    }
    console.log(row);
  }

  console.log('\nMonth-by-month, year 1 (base case):');
  console.log('mo'.padEnd(4) + 'cal'.padEnd(5) + 'season'.padStart(7) + 'signups'.padStart(9) +
    'users'.padStart(8) + 'convs'.padStart(7) + 'revenue'.padStart(10) + 'balance'.padStart(11));
  for (const r of simulate(12)) {
    console.log(
      String(r.month).padEnd(4) + r.calLabel.padEnd(5) +
      r.season.toFixed(2).padStart(7) + r.newSignups.toLocaleString().padStart(9) +
      r.totalUsers.toLocaleString().padStart(8) + String(r.converters).padStart(7) +
      fmt(r.revenue).padStart(10) + fmt(r.cumBalance).padStart(11),
    );
  }
}
