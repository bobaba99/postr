/**
 * Pricing-option comparison — projects each deck-monetization option
 * with ABUSE leakage and MoR FEE structure baked in.
 *
 * Extends the base seasonal signup/conversion model (projection.mjs)
 * but replaces the deck economics per option. The question: which deck
 * pricing produces the best 3-year net, once you account for the
 * Lemon Squeezy fee ($0.50 fixed hurts small tickets) AND trial abuse?
 *
 * Abuse parameters (ABUSE.*) are set from published benchmarks — see
 * ABUSE_BENCHMARKS below. All are flagged; the ones without a solid
 * source are conservative assumptions and are the knobs to sensitivity-
 * test.
 */

// ── MoR fee (Lemon Squeezy / Polar): 5% + $0.50 fixed ──────────────
const MOR_PCT = 0.05, MOR_FIXED = 0.5;
const morNet = (price) => price - (MOR_PCT * price + MOR_FIXED);
const morEff = (price) => (MOR_PCT * price + MOR_FIXED) / price;

// ── Unit LLM cost (measured, business-model.mjs) ───────────────────
const COST_DECK = 0.056;       // one deck generation, worst realistic
const COST_POSTER_FREE = 0.0139 * 0.3;

// ── Seasonal signup model (mirrors projection.mjs) ─────────────────
const SEASON = [1.4,1.9,2.4,2.2,1.1,0.5, 0.35,0.6,1.3,1.8,1.5,0.7];
const SEASON_AVG = SEASON.reduce((a,b)=>a+b,0)/12;
const MABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function hostingFor(mau){ return mau<2000?52:mau<20000?90:220; }

// ── Base funnel defaults (conservative EdTech, from BENCHMARKS.md) ──
const BASE = {
  seedSignups: 120, organicGrowth: 0.05,
  posterConversion: 0.026,   // free→paid on the poster side (term buyers)
  repurchase: 0.22,
};

// ══ ABUSE MODEL — set from research (placeholders flagged TODO) ═════
// abuseMultiplier: extra FRAUDULENT free generations per real signup,
//   AFTER mitigations. e.g. 0.15 = for every 100 real trial users, 15
//   extra abusive free decks are farmed via multi-account/recreate.
// trialConvUplift: how much more likely a user is to buy the term/deck
//   after SEEING a free deck vs never trying one (multiplier).
const ABUSE = {
  // Base multi-account/abuse rate. Stripe (Mar 2026): 7.4% of AI-startup
  // signups implicated in multi-account abuse [SOLID]. BUT abuse tracks
  // payoff/account (Security Boulevard; GitLab natural experiment), and
  // Postr's payoff is ~$0.02-0.05 with NO resale — ~100× below the AI
  // products reporting 7.4%. So base is set LOWER, as casual manual
  // multi-accounting (1-in-5 reuse promos; 29% Gen Z — Stripe/451)
  // after the free mitigation stack (email normalize + disposable block
  // + hash-on-delete). Bands: low 3% / base 8% / high 15%.
  abuseMultiplier: 0.08,        // [research-anchored; see BENCHMARKS]
  // Trial→paid uplift: how much more likely to buy after seeing one free
  // deck. No published curve for this exact case [INFERENCE]. Freemium
  // "aha moment" effect is real but unquantified for Postr. Kept as the
  // KEY sensitivity knob, not a claimed fact. Bands: 1.3 / 1.6 / 2.0.
  trialConvUplift: 1.6,         // [ASSUMPTION — the deciding variable]
  costPerFreeDeck: COST_DECK,
};

// ── The options ────────────────────────────────────────────────────
// Each defines: how a converter pays for decks, the per-conversion NET
// revenue, whether there's a free-trial abuse surface, and the deck
// conversion rate (relative to the poster conversion baseline).
const OPTIONS = {
  term_only: {
    label: '1 · $19 term only (no pack, no trial)',
    deckConvMult: 0.7,   // fewer buy decks with no trial to see value
    netPerDeckSale: morNet(19),  // decks come with the term; no separate txn
    perDeckSaleIsTermItself: true,
    freeTrial: false,
    engineering: 'lowest — no ledger, no trial, no abuse defense',
  },
  pack_9: {
    label: '2 · $19 term + $9 5-export pack',
    deckConvMult: 0.85,
    netPerDeckSale: morNet(9),
    freeTrial: false,
    engineering: 'medium — credit ledger, no trial abuse',
  },
  free_trial: {
    label: '3 · Free single-deck trial, pay $19 to export',
    deckConvMult: 1.0,   // trial lifts conversion (via trialConvUplift)
    netPerDeckSale: morNet(19),
    freeTrial: true,
    engineering: 'highest — trial gating + abuse defense + email hashes',
  },
  paid_tryout: {
    label: '4 · $6 single-deck paid tryout (pay before generate)',
    deckConvMult: 1.0,
    netPerDeckSale: morNet(6),   // 15% eff — the fee trap, but NO abuse
    freeTrial: false,
    engineering: 'medium — micro-txn, no abuse (payment gates generation)',
  },
};

function simulate(months, optKey, over = {}) {
  const p = { ...BASE, ...ABUSE, ...over };
  const opt = OPTIONS[optKey];
  const rows = [];
  let totalUsers = 0, cumBalance = 0, returningPool = 0;

  for (let m = 0; m < months; m++) {
    const cal = m % 12, season = SEASON[cal];
    const trend = p.seedSignups * Math.pow(1 + p.organicGrowth, m);
    const newSignups = m === 0 ? p.seedSignups : Math.round((trend * season) / SEASON_AVG);
    totalUsers += newSignups;

    // Term/poster conversion (seasonal).
    const seasonalConv = Math.min(p.posterConversion * season, 0.12);
    const newConverters = newSignups * seasonalConv;
    const repurch = season > 1.2 ? returningPool * p.repurchase : 0;
    returningPool += newConverters;
    const converters = newConverters + repurch;

    // Deck revenue depends on the option.
    let deckRevenue = 0, deckCost = 0, abuseCost = 0;
    const deckBuyers = converters * opt.deckConvMult *
      (opt.freeTrial ? p.trialConvUplift : 1);

    if (opt.perDeckSaleIsTermItself) {
      // Decks bundled into the term — revenue already in the term sale.
      deckRevenue = deckBuyers * opt.netPerDeckSale;
      deckCost = deckBuyers * COST_DECK; // they generate ~1 deck
    } else {
      deckRevenue = deckBuyers * opt.netPerDeckSale;
      deckCost = deckBuyers * COST_DECK;
    }

    // Free-trial abuse: every new signup can farm free generations.
    if (opt.freeTrial) {
      const legitTrials = newSignups;             // everyone tries once
      const abusiveTrials = newSignups * p.abuseMultiplier;
      abuseCost = (legitTrials + abusiveTrials) * p.costPerFreeDeck;
    }

    const freePosterCost = (totalUsers - converters) * COST_POSTER_FREE * (season / SEASON_AVG);
    const hosting = hostingFor(totalUsers);
    const revenue = deckRevenue;
    const cost = deckCost + abuseCost + freePosterCost + hosting;
    const profit = revenue - cost;
    cumBalance += profit;

    rows.push({ month:m+1, cal:MABBR[cal], newSignups, totalUsers,
      converters:Math.round(converters), deckBuyers:Math.round(deckBuyers),
      revenue, abuseCost, cost, profit, cumBalance });
  }
  return rows;
}

// ── CLI ────────────────────────────────────────────────────────────
const usd = (n) => (n<0?'-$':'$') + Math.round(Math.abs(n)).toLocaleString();

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('PRICING OPTIONS — 3-year net, with MoR fees + trial abuse\n');
  console.log('MoR fee (Lemon Squeezy 5%+$0.50) effective rate by price:');
  for (const pr of [4.99, 6, 9, 19]) console.log(`  $${pr}: ${(morEff(pr)*100).toFixed(1)}% eff → net ${usd(morNet(pr))}`);
  console.log(`\nABUSE: multiplier ${ABUSE.abuseMultiplier} (Stripe 7.4% AI-signup base, scaled down for near-zero payoff), trial uplift ${ABUSE.trialConvUplift}× [the unsourced deciding knob]\n`);
  console.log('─'.repeat(78));
  console.log('option'.padEnd(46) + '6mo'.padStart(9) + '1yr'.padStart(10) + '3yr'.padStart(12));
  console.log('─'.repeat(78));
  for (const key of Object.keys(OPTIONS)) {
    const r6 = simulate(6, key), r12 = simulate(12, key), r36 = simulate(36, key);
    console.log(
      OPTIONS[key].label.padEnd(46) +
      usd(r6[5].cumBalance).padStart(9) +
      usd(r12[11].cumBalance).padStart(10) +
      usd(r36[35].cumBalance).padStart(12)
    );
  }
  console.log('─'.repeat(78));

  console.log('\nFree-trial abuse sensitivity (option 3, 3-yr net):');
  console.log('abuse mult →'.padEnd(16) + ['0%','15%','40%','100%'].map(s=>s.padStart(11)).join(''));
  for (const uplift of [1.3, 1.6, 2.0]) {
    let row = `uplift ${uplift}×`.padEnd(16);
    for (const ab of [0, 0.15, 0.40, 1.0]) {
      const r = simulate(36, 'free_trial', { abuseMultiplier: ab, trialConvUplift: uplift });
      row += usd(r[35].cumBalance).padStart(11);
    }
    console.log(row);
  }
  console.log('\n(abuse barely moves it — each abused deck costs ~$0.056. The');
  console.log(' uplift matters 100× more than the abuse. That is the real finding.)');
}
