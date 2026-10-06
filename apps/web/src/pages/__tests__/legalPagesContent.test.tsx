/**
 * What the legal pages must publish, as rendered at their routes, in
 * English and French (owner decisions of 2026-10-06, record 24).
 *
 * The checks come from the decisions file's list, not from the pages'
 * wording: Quebec's Law 25 (the person in charge published as a role of
 * Resila Technologies Inc., never a person or "President"; governance; every
 * right with how to use it, the 30-day reply, the CAI and the OPC;
 * communication outside Quebec; no technology that identifies, locates or
 * profiles; automated decisions; privacy by default), Canada first and then
 * other countries, the recipients the code reaches with Vercel, Render and
 * Supabase first, only Vercel Web Analytics and Global Privacy Control,
 * Google Fonts, the Terms' Quebec incorporation, prices before tax,
 * cancellation at the end of the period, the consumer's own court, and no
 * LaTeX (hidden). The English and French pages are kept in step: the same
 * headings, list items, table rows and boxes.
 *
 * Presence is not enough: an inverted sentence keeps its words (review
 * round 1 of record 24 turned "do not require arbitration" into "require
 * arbitration" and no test noticed). So the decided commitments are also
 * checked the right way round, and the numbers the pages promise are read
 * from the code that enforces them (the API's refund window and guest
 * clean-up period) or, for the 30-day reply, from the decisions.
 *
 * Review round 2 (a production build, three browsers, a French reader, the
 * statutes) added: page counting is on by default, so it is not listed
 * among the private defaults (App.tsx mounts Vercel Web Analytics unless
 * the browser sends GPC; src/__tests__/analyticsPrivacy.test.tsx); what
 * Vercel derives from a page view (an approximate location, the device and
 * the browser, per its own documentation) is said, and the "nothing locates
 * you" sentence carries that exception; the GDPR transfer paragraph names
 * Canada's adequacy and how to learn a provider's safeguard; each Terms
 * clause that may not apply to a Quebec consumer is immediately preceded
 * by a prominent statement saying so (Consumer Protection Act s. 19.1);
 * portability promises what the law gives; and the French reads as Quebec
 * French (prices, legal vocabulary, no anglicisms, curly apostrophes).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => new Promise<never>(() => {})),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

import Privacy from '../Privacy';
import PrivacyFr from '../PrivacyFr';
import Cookies from '../Cookies';
import CookiesFr from '../CookiesFr';
import Terms from '../Terms';
import TermsFr from '../TermsFr';

function page(Component: () => React.ReactElement) {
  const { container, unmount } = render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  );
  const article = container.querySelector('article');
  if (!article) throw new Error('no article');
  const text = (article.textContent ?? '').replace(/\s+/g, ' ');
  const headings = [...article.querySelectorAll('h2')].map((h) => (h.textContent ?? '').trim());
  const tables = [...article.querySelectorAll('table')].map((table) => ({
    headers: [...table.querySelectorAll('th')].map((th) => (th.textContent ?? '').trim()),
    rows: [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()),
    ),
  }));
  const shape = {
    h2: article.querySelectorAll('h2').length,
    h3: article.querySelectorAll('h3').length,
    li: article.querySelectorAll('li').length,
    tr: article.querySelectorAll('tr').length,
    callouts: article.querySelectorAll('div.border-l-4').length,
    ids: [...article.querySelectorAll('[id]')].map((el) => el.id),
  };
  const links = [...article.querySelectorAll('a[href]')].map((a) => ({
    href: a.getAttribute('href') ?? '',
    text: (a.textContent ?? '').trim(),
  }));
  const calloutTitles = [...article.querySelectorAll('div.border-l-4')].map((box) =>
    (box.querySelector('strong')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
  unmount();
  return { text, headings, tables, shape, links, calloutTitles };
}

/** Every number a pattern's first group captures in the text. */
const numbersIn = (text: string, patterns: readonly RegExp[]) =>
  patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => Number(match[1])));

/** A numeric constant as the API declares it (`const NAME = 14;`). */
function apiConstant(file: string, name: string): number {
  const source = readFileSync(join(process.cwd(), '../api/src', file), 'utf8');
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  if (!match) throw new Error(`${name} not found in apps/api/src/${file}`);
  return Number(match[1]);
}

const missing = (text: string, required: Record<string, RegExp>) =>
  Object.entries(required)
    .filter(([, pattern]) => !pattern.test(text))
    .map(([name]) => name);

const PRIVACY_EN: Record<string, RegExp> = {
  'the company': /Resila Technologies Inc\./,
  incorporated: /incorporated in Quebec/i,
  'person in charge (s. 3.1)': /person in charge of the protection of personal information/i,
  'published as a role': /Privacy Officer/,
  contact: /support@resila\.ai/,
  'Law 25': /Law 25/,
  PIPEDA: /PIPEDA/,
  'reply within 30 days': /within 30 days/i,
  access: /\baccess\b/i,
  rectification: /correct/i,
  'withdraw consent': /withdraw (your |a )?consent/i,
  deletion: /delet/i,
  'de-indexation (s. 28.1)': /de-index/i,
  portability: /portab/i,
  'structured, commonly used format (s. 27)': /structured, commonly used/i,
  CAI: /Commission d’accès à l’information du Québec/,
  OPC: /Office of the Privacy Commissioner of Canada/,
  'outside Quebec': /outside Quebec/i,
  'United States or other countries': /United States or other countries/,
  'governance: roles': /roles and responsibilities/i,
  'governance: retention and destruction': /destr(oy|uction)/i,
  'complaints process': /complaint/i,
  'confidentiality incidents': /confidentiality incidents?/i,
  'no identify/locate/profile (s. 8.1)': /identif(y|ies), locate(s)? or profile(s)?/i,
  'automated decisions (s. 12.1)': /automated (processing|decision)/i,
  'privacy by default (s. 9.1)': /by default/i,
  'only Vercel Web Analytics': /Vercel Web Analytics/,
  GPC: /Global Privacy Control/,
  'how to object': /object/i,
  'Google Fonts': /Google Fonts/,
  'IP address and user agent to Google': /IP address and (browser )?user agent/i,
  'GDPR legal bases': /legal bas(is|es)/i,
  'GDPR supervisory authority': /supervisory authority/i,
  'in-app download': /Download my data/,
  'Anthropic named': /Anthropic/,
  'Stripe named': /Stripe/,
};

const PRIVACY_FR: Record<string, RegExp> = {
  'the company': /Resila Technologies Inc\./,
  incorporated: /constituée au Québec/i,
  'person in charge (s. 3.1)': /responsable de la protection des renseignements personnels/i,
  'published as a role': /Responsable de la protection des renseignements personnels, Resila Technologies Inc\./,
  contact: /support@resila\.ai/,
  'Law 25': /Loi 25/,
  PIPEDA: /LPRPDE/,
  'reply within 30 days': /dans les 30 jours/i,
  access: /\baccès\b/i,
  rectification: /rectifi/i,
  'withdraw consent': /retirer (votre |un )?consentement/i,
  deletion: /suppr/i,
  'de-indexation (s. 28.1)': /désindex/i,
  portability: /portabilité/i,
  'structured, commonly used format (s. 27)': /structuré et couramment utilisé/i,
  CAI: /Commission d’accès à l’information du Québec/,
  OPC: /Commissariat à la protection de la vie privée du Canada/,
  'outside Quebec': /à l’extérieur du Québec/i,
  'United States or other countries': /États-Unis ou dans d’autres pays/,
  'governance: roles': /rôles et (les )?responsabilités/i,
  'governance: retention and destruction': /destruction|détrui/i,
  'complaints process': /plainte/i,
  'confidentiality incidents': /incidents? de confidentialité/i,
  // s. 8.1's own words: « permettant de l'identifier, de la localiser ou
  // d'effectuer un profilage de celle-ci ».
  'no identify/locate/profile (s. 8.1)': /identifier, (de )?(vous |la )?localiser ou (d’)?effectuer (un|votre) profilage/i,
  'automated decisions (s. 12.1)': /traitement automatisé|décision automatisée/i,
  'privacy by default (s. 9.1)': /par défaut/i,
  'only Vercel Web Analytics': /Vercel Web Analytics/,
  GPC: /Global Privacy Control/,
  'how to object': /vous opposer|opposition/i,
  'Google Fonts': /Google Fonts/,
  'IP address and user agent to Google': /adresse IP et (l’|votre )?agent utilisateur/i,
  'GDPR legal bases': /bases? juridiques?/i,
  'GDPR supervisory authority': /autorité de contrôle/i,
  'in-app download': /Download my data/,
  'Anthropic named': /Anthropic/,
  'Stripe named': /Stripe/,
};

const NOT_ON_PRIVACY: Record<string, RegExp> = {
  'LaTeX (hidden)': /LaTeX|Overleaf/,
  'signed SCCs (not confirmed)': /Standard Contractual Clauses|clauses contractuelles types/i,
  'a specific hosting region': /Oregon|us-west/i,
  'a DPO threshold promise': /Data Protection Officer|délégué à la protection des données/i,
  'a CCPA threshold claim': /California Consumer Privacy Act \(CCPA\) applies/i,
  // Which Stripe entity is the merchant of record under Managed Payments
  // was not confirmed, and the code's comments disagree (Stripe, or Link):
  // the pages describe Stripe's merchant-of-record service, not the seller.
  'a named merchant of record (not confirmed)': /\bas the merchant of record\b|à titre de marchand (attitré|officiel)/i,
};

/** The recipients table: its rows whose first cell names a provider. */
function recipientNames(tables: ReturnType<typeof page>['tables']): string[] {
  const providers = /^(?:Fondation )?(Vercel|Render|Supabase|Anthropic|Stripe|Google|Wikimedia|OpenAI)\b/;
  const table = tables.find((t) => t.rows.some((row) => providers.test(row[0] ?? '')));
  return (table?.rows ?? []).map((row) => (row[0] ?? '').match(providers)?.[1] ?? row[0] ?? '');
}

/** The rights table: [right, what it means, how to use it today]. */
function rightsRows(tables: ReturnType<typeof page>['tables'], how: RegExp): string[][] {
  return tables.find((t) => t.headers.some((h) => how.test(h)))?.rows ?? [];
}

describe('Privacy Policy — what Law 25 and the owner require it to publish', () => {
  it.each([
    ['English', Privacy, PRIVACY_EN],
    ['French', PrivacyFr, PRIVACY_FR],
  ] as const)('%s publishes every required element', (_lang, Component, required) => {
    expect(missing(page(Component).text, required)).toEqual([]);
  });

  it.each([
    ['English', Privacy],
    ['French', PrivacyFr],
  ] as const)('%s states nothing the decisions dropped or hid', (_lang, Component) => {
    const { text } = page(Component);
    const present = Object.entries(NOT_ON_PRIVACY).filter(([, p]) => p.test(text)).map(([n]) => n);
    expect(present).toEqual([]);
  });

  it.each([
    ['English', Privacy, /Canada|Quebec/, /European|GDPR|United States/i],
    ['French', PrivacyFr, /Canada|Québec/, /européenne|RGPD|États-Unis/i],
  ] as const)('%s speaks to Canada first, then other countries', (_lang, Component, canada, elsewhere) => {
    const { headings } = page(Component);
    const first = headings.findIndex((h) => canada.test(h));
    const later = headings.findIndex((h) => elsewhere.test(h));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(later).toBeGreaterThan(first);
  });

  it.each([
    ['English', Privacy],
    ['French', PrivacyFr],
  ] as const)('%s lists Vercel, Render and Supabase first, then the others the code reaches', (_lang, Component) => {
    const names = recipientNames(page(Component).tables);
    expect(names.slice(0, 3)).toEqual(['Vercel', 'Render', 'Supabase']);
    expect(names).toEqual(expect.arrayContaining(['Anthropic', 'Stripe', 'Google', 'Wikimedia']));
    // The narrative router (OpenAI) is mounted only behind FEATURE_MANUSCRIPT,
    // off with its hidden UI (apps/api/src/app.ts): no user reaches it.
    expect(names).not.toContain('OpenAI');
  });

  it.each([
    ['English', Privacy, /how to use it/i, [/access/i, /rectification/i, /withdraw/i, /deletion/i, /de-index/i, /portability/i, /complaint/i]],
    ['French', PrivacyFr, /comment l’exercer/i, [/accès/i, /rectification/i, /retrait/i, /suppression/i, /désindexation/i, /portabilité/i, /plainte/i]],
  ] as const)('%s writes out every right with how to use it in Postr today', (_lang, Component, how, rights) => {
    const rows = rightsRows(page(Component).tables, how);
    for (const right of rights) {
      const row = rows.find((r) => right.test(r[0] ?? ''));
      expect(row, String(right)).toBeDefined();
      expect((row?.[2] ?? '').length, String(right)).toBeGreaterThan(20);
    }
  });
});

describe('Cookies Policy — GPC, Vercel Web Analytics only, Google Fonts', () => {
  it.each([
    ['English', Cookies, /Postr honours Global Privacy Control/, /does not load Vercel Web Analytics/i, /Google Fonts/, /IP address and user agent/i],
    ['French', CookiesFr, /Postr respecte le signal Global Privacy Control/, /ne charge pas Vercel Web Analytics/i, /Google Fonts/, /adresse IP et (l’|votre )?agent utilisateur/i],
  ] as const)('%s says analytics is not loaded under GPC', (_lang, Component, gpc, notLoaded, fonts, ip) => {
    const { text } = page(Component);
    expect(text).toMatch(gpc);
    expect(text).toMatch(notLoaded);
    expect(text).toMatch(fonts);
    expect(text).toMatch(ip);
    expect(text).not.toMatch(/does not switch off page counting|ne désactive pas le comptage/i);
  });
});

const TERMS_EN: Record<string, RegExp> = {
  incorporated: /incorporated in Quebec/i,
  'prices before tax': /before tax/i,
  'tax added at checkout': /added at checkout/i,
  'cancellation at the end of the period': /end of the (paid )?period/i,
  'unused term refund in 14 days': /14 days/,
  'ends at once': /ends (at once|straight away|immediately)/i,
  'pack rule': /none of your export credits has been used/i,
  'editable export is PowerPoint': /PowerPoint/,
  'Quebec consumers: own court': /court of (your|the) district where you live|court of your domicile/i,
  'class action kept': /class action/i,
  'no arbitration required': /arbitration/i,
  'governing law': /laws of the Province of Quebec/i,
  'Consumer Protection Act': /Consumer Protection Act/,
  'the pack refund is what was paid, tax included': /refund the full amount you paid for your most recent pack/,
  'the Privacy Policy is a notice, not a term': /Privacy Policy explains how we handle your personal information/,
};

const TERMS_FR: Record<string, RegExp> = {
  incorporated: /constituée au Québec/i,
  'prices before tax': /avant taxes/i,
  'tax added at checkout': /ajoutées au moment du paiement/i,
  'cancellation at the end of the period': /fin de la période/i,
  'unused term refund in 14 days': /14 jours/,
  'ends at once': /prend fin (immédiatement|aussitôt)/i,
  'pack rule': /aucun de vos crédits d’exportation n’(a|ait) été utilisé/i,
  'editable export is PowerPoint': /PowerPoint/,
  'Quebec consumers: own court': /tribunal (du district )?de votre domicile/i,
  'class action kept': /action collective/i,
  'no arbitration required': /arbitrage/i,
  'governing law': /lois de la province de Québec/i,
  'Consumer Protection Act': /Loi sur la protection du consommateur/,
  'the pack refund is what was paid, tax included': /rembourserons intégralement le montant payé pour votre plus récent lot/,
  'the Privacy Policy is a notice, not a term': /Politique de confidentialité explique comment nous traitons vos renseignements personnels/,
};

describe('Terms of Service — the owner’s decisions', () => {
  it.each([
    ['English', Terms, TERMS_EN],
    ['French', TermsFr, TERMS_FR],
  ] as const)('%s states every decided term', (_lang, Component, required) => {
    expect(missing(page(Component).text, required)).toEqual([]);
  });

  it.each([
    ['English', Terms],
    ['French', TermsFr],
  ] as const)('%s no longer offers LaTeX export, and keeps the refunds anchor', (_lang, Component) => {
    const { text, shape } = page(Component);
    expect(text).not.toMatch(/LaTeX|Overleaf/);
    expect(shape.ids).toContain('refunds');
  });

  it.each([
    ['English', Terms],
    ['French', TermsFr],
  ] as const)('%s names no merchant-of-record entity it has not confirmed', (_lang, Component) => {
    expect(page(Component).text).not.toMatch(NOT_ON_PRIVACY['a named merchant of record (not confirmed)']!);
  });
});

describe('the person in charge is a role of Resila, never a person', () => {
  it.each([
    ['Privacy', Privacy],
    ['PrivacyFr', PrivacyFr],
    ['Cookies', Cookies],
    ['CookiesFr', CookiesFr],
    ['Terms', Terms],
    ['TermsFr', TermsFr],
  ] as const)('%s names no President', (_name, Component) => {
    expect(page(Component).text).not.toMatch(/\bPresident\b|\bprésident(e)?\b/i);
  });
});

describe('the decided commitments, the right way round', () => {
  it.each([
    [
      'English',
      Privacy,
      [
        /Postr uses no technology that identifies, locates or profiles you/,
        /If your browser sends Global Privacy Control[^.]*, Postr does not load Vercel Web Analytics at all, so your page views are not counted\./,
      ],
    ],
    [
      'French',
      PrivacyFr,
      [
        /Postr n’utilise aucune technologie qui permet de vous identifier, de vous localiser ou d’effectuer votre profilage/,
        /Si votre navigateur envoie le signal Global Privacy Control[^.]*, Postr ne charge pas du tout Vercel Web Analytics : vos pages vues ne sont pas comptées\./,
      ],
    ],
  ] as const)('%s Privacy: no technology that identifies, locates or profiles; no page counting under GPC', (_lang, Component, sentences) => {
    const { text } = page(Component);
    for (const sentence of sentences) expect(text).toMatch(sentence);
  });

  it.each([
    ['English', Privacy, [/within (\d+) days/g]],
    ['French', PrivacyFr, [/dans les (\d+) jours/g]],
  ] as const)('%s Privacy: every written reply it promises comes within 30 days', (_lang, Component, patterns) => {
    // The request reply (§10, s. 32) and the complaint reply (§11).
    const days = numbersIn(page(Component).text, patterns);
    expect(days.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(days)]).toEqual([30]);
  });

  it.each([
    [
      'English',
      Privacy,
      'Person in charge of the protection of personal information (Privacy Officer), Resila Technologies Inc.',
      /: the Privacy Officer, Resila Technologies Inc\., support@resila\.ai\./,
    ],
    [
      'French',
      PrivacyFr,
      'Responsable de la protection des renseignements personnels, Resila Technologies Inc.',
      /: le responsable de la protection des renseignements personnels, Resila Technologies Inc\., support@resila\.ai\./,
    ],
  ] as const)('%s Privacy: the person in charge is published as the role alone', (_lang, Component, role, contact) => {
    const { calloutTitles, text } = page(Component);
    // The first box, under §1, is the person in charge: the role, nothing added.
    expect(calloutTitles[0]).toBe(role);
    expect(text).toMatch(contact);
  });

  it.each([
    [
      'English',
      Terms,
      [
        /subject to the exceptions below\./,
        /If you are a consumer in Quebec, you keep your right under the Consumer Protection Act to bring proceedings before the court of the district where you live\./,
        /These Terms do not require arbitration, and they do not stop you from bringing or taking part in a class action\./,
      ],
    ],
    [
      'French',
      TermsFr,
      [
        /sous réserve des exceptions ci-dessous\./,
        /Si vous êtes un consommateur au Québec, vous conservez le droit que vous confère la Loi sur la protection du consommateur d’intenter une poursuite devant le tribunal de votre domicile\./,
        /Les présentes Conditions n’imposent pas l’arbitrage et ne vous empêchent pas d’intenter une action collective ou d’y participer\./,
      ],
    ],
  ] as const)('%s Terms: the consumer’s own court, no arbitration, class actions kept', (_lang, Component, sentences) => {
    const { text } = page(Component);
    for (const sentence of sentences) expect(text).toMatch(sentence);
  });

  it.each([
    // (?![\d.]) stops a match from backing off to "CA$18" before ".99 plus".
    ['English', Terms, /CA\$\d+/g, /CA\$\d+(?:\.\d+)?(?![\d.])(?! plus (?:applicable taxes|the tax))/g],
    // Quebec French writes 18,99 $ CA (OQLF); the page uses no-break spaces,
    // which the text normalisation turns into plain ones.
    ['French', TermsFr, /\d+,\d{2} \$ CA/g, /\d+,\d{2} \$ CA(?! plus les taxes)/g],
  ] as const)('%s Terms: every price is given before tax', (_lang, Component, price, untaxed) => {
    const { text } = page(Component);
    // The term, the pack, and the pack's refund.
    expect([...text.matchAll(price)].length).toBeGreaterThanOrEqual(3);
    expect([...text.matchAll(untaxed)].map((match) => match[0])).toEqual([]);
  });

  const TERM_REFUND_WINDOW_DAYS = apiConstant('billing.ts', 'TERM_REFUND_WINDOW_DAYS');
  it.each([
    ['English', Terms, [/within (\d+) days of (?:that|the) charge/g, /After (\d+) days/g, /(\d+)-day money-back/g]],
    ['French', TermsFr, [/dans les (\d+) jours suivant cette facturation/g, /Après (\d+) jours/g, /remboursement de (\d+) jours/g]],
  ] as const)('%s Terms: the unused-term refund window is the one the API enforces', (_lang, Component, patterns) => {
    // §7.1 (the exception to cancelling at period end) and §7.2 (the guarantee).
    const days = numbersIn(page(Component).text, patterns);
    expect(days.length).toBeGreaterThanOrEqual(4);
    expect([...new Set(days)]).toEqual([TERM_REFUND_WINDOW_DAYS]);
  });

  const STALE_GUEST_DAYS = apiConstant('cron.ts', 'STALE_GUEST_DAYS');
  it.each([
    ['Privacy', Privacy, /once (\d+) days have passed since (?:their|its) last sign-in/g],
    ['PrivacyFr', PrivacyFr, /une fois (?:écoulés )?(\d+) jours (?:écoulés )?depuis (?:leur|sa) dernière connexion/g],
    ['Terms', Terms, /once (\d+) days have passed since (?:their|its) last sign-in/g],
    ['TermsFr', TermsFr, /une fois (?:écoulés )?(\d+) jours (?:écoulés )?depuis (?:leur|sa) dernière connexion/g],
  ] as const)('%s: guest accounts are deleted after the period the clean-up job uses', (_name, Component, pattern) => {
    const days = numbersIn(page(Component).text, [pattern]);
    expect(days.length).toBeGreaterThanOrEqual(1);
    expect([...new Set(days)]).toEqual([STALE_GUEST_DAYS]);
  });

  it.each([
    ['Privacy', Privacy, 'en'],
    ['PrivacyFr', PrivacyFr, 'fr'],
    ['Cookies', Cookies, 'en'],
    ['CookiesFr', CookiesFr, 'fr'],
    ['Terms', Terms, 'en'],
    ['TermsFr', TermsFr, 'fr'],
  ] as const)('%s links the legal pages in its own language, the language switch aside', (_name, Component, lang) => {
    const switchText = lang === 'fr' ? 'English' : 'Français';
    const legal = page(Component).links.filter((link) => /^\/(privacy|cookies|terms)(\/fr)?(#.*)?$/.test(link.href));
    const inFrench = (href: string) => /^\/(privacy|cookies|terms)\/fr(#|$)/.test(href);
    expect(legal.filter((link) => link.text === switchText)).toHaveLength(1);
    const wrong = legal.filter((link) => link.text !== switchText && inFrench(link.href) !== (lang === 'fr'));
    expect(wrong).toEqual([]);
  });
});

/** The elements under the h2 whose text matches `title`, up to the next h2. */
function section(Component: () => React.ReactElement, title: RegExp) {
  const { container, unmount } = render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  );
  const article = container.querySelector('article');
  if (!article) throw new Error('no article');
  const h2 = [...article.querySelectorAll('h2')].find((h) => title.test(h.textContent ?? ''));
  if (!h2) throw new Error(`no section ${title}`);
  const elements: Element[] = [];
  for (let el = h2.nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) elements.push(el);
  const clean = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim();
  const result = {
    items: elements.flatMap((el) => [...el.querySelectorAll('li')].map((li) => clean(li.textContent))),
    text: clean(elements.map((el) => el.textContent).join(' ')),
  };
  unmount();
  return result;
}

/**
 * Each clause that may not apply to a Quebec consumer, and the element
 * right before it: Consumer Protection Act s. 19.1 asks that such a
 * stipulation be "immediately preceded by an explicit and prominently
 * presented statement to that effect". Indemnification (§5.5), the
 * warranty disclaimer (§10) and the exclusion of liability (§11) may fall
 * under s. 10 (no stipulation frees a merchant from the consequences of
 * its own act); "continued use means you accept" (§13) under s. 11.2.
 */
function quebecNotices(Component: () => React.ReactElement, headings: RegExp[], sentence: RegExp) {
  const { container, unmount } = render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  );
  const article = container.querySelector('article')!;
  const before = (el: Element | null | undefined) => el?.previousElementSibling ?? null;
  const targets: [string, Element | null][] = headings.map((heading) => {
    const h = [...article.querySelectorAll('h2, h3')].find((x) => heading.test(x.textContent ?? ''));
    return [String(heading), h ? h.nextElementSibling : null];
  });
  const continued = [...article.querySelectorAll('p')].find((p) => sentence.test(p.textContent ?? ''));
  targets.push([String(sentence), before(continued)]);
  const read = targets.map(([name, el]) => ({
    name,
    text: (el?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    strong: (el?.querySelector('strong')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  }));
  unmount();
  return read;
}

describe('review round 2 — what the pages say about page counting, transfers, Quebec consumers and Quebec French', () => {
  it.each([
    ['English', Privacy, /Privacy by default/, /page counting|Global Privacy Control/i, /Page counting is on by default\./],
    ['French', PrivacyFr, /Confidentialité par défaut/, /comptage|Global Privacy Control/i, /Le comptage des pages vues est activé par défaut\./],
  ] as const)('%s Privacy §8: page counting is on by default, so it is not listed among the private defaults', (_lang, Component, title, counting, onByDefault) => {
    // App.tsx mounts Vercel Web Analytics unless the browser sends GPC
    // (the control in src/__tests__/analyticsPrivacy.test.tsx): turning GPC
    // on is the visitor's own step, not a default (Law 25 s. 9.1).
    const { items, text } = section(Component, title);
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.filter((item) => counting.test(item))).toEqual([]);
    expect(text).toMatch(onByDefault);
  });

  it.each([
    ['English', Privacy, /Page counting, cookies/, /approximate location/, /device type/, /operating system/, /browser/,
      /Apart from the approximate location Vercel derives from each page view \(Section 6\), Postr uses no technology that identifies, locates or profiles you/],
    ['French', PrivacyFr, /Comptage des pages vues, témoins/, /localisation approximative/, /type d’appareil/, /système d’exploitation/, /navigateur/,
      /Hormis la localisation approximative que Vercel déduit de chaque page vue \(section 6\), Postr n’utilise aucune technologie qui permet de vous identifier, de vous localiser ou d’effectuer votre profilage/],
  ] as const)('%s Privacy §6–§7: what Vercel derives from a page view is said, and "nothing locates you" carries it', (_lang, Component, s6, location, device, os, browser, s7) => {
    // Vercel's documentation (docs/analytics/privacy-policy, "Data point
    // information"): each data point may store a geolocation (country,
    // region, city), the device OS and version, the browser and version and
    // the device type, derived from the request.
    const { text } = section(Component, s6);
    for (const pattern of [location, device, os, browser]) expect(text, String(pattern)).toMatch(pattern);
    expect(page(Component).text).toMatch(s7);
  });

  it.each([
    ['English', Cookies, /approximate location/],
    ['French', CookiesFr, /localisation approximative/],
  ] as const)('%s Cookies §4: says Vercel derives an approximate location from a page view', (_lang, Component, pattern) => {
    expect(page(Component).text).toMatch(pattern);
  });

  it.each([
    ['English', Privacy, /If you are in the European Union/, [/recognise Canada as giving adequate protection/, /Data Privacy Framework/, /whether an adequacy decision or another safeguard covers a provider, and to get a copy of any safeguard/]],
    ['French', PrivacyFr, /Si vous êtes dans l’Union européenne/, [/reconnaissent que le Canada offre une protection adéquate/, /Data Privacy Framework/, /si une décision d’adéquation ou une autre garantie couvre un fournisseur, et pour obtenir une copie de toute garantie/]],
  ] as const)('%s Privacy §15: transfers name Canada’s adequacy and how to learn a provider’s safeguard (GDPR art. 13(1)(f))', (_lang, Component, title, required) => {
    const { text } = section(Component, title);
    for (const pattern of required) expect(text, String(pattern)).toMatch(pattern);
    // No safeguard is claimed for a provider (owner decision 10 dropped SCCs
    // and DPAs; which providers are certified was not checked).
    expect(text).not.toMatch(/\bis certified\b|\bare certified\b|est certifiée?|sont certifiés/);
  });

  it.each([
    ['English', Privacy, /^Portability$/, /a person or body that the law authorizes to collect it/, /you choose/, /If you are in the European Union/, /sent directly to another organization, where technically feasible/],
    ['French', PrivacyFr, /^Portabilité$/, /une personne ou à un organisme que la loi autorise à les recueillir/, /de votre choix/, /Si vous êtes dans l’Union européenne/, /transmettre directement à un autre organisme, lorsque c’est techniquement possible/],
  ] as const)('%s Privacy: portability promises what the law gives (Law 25 s. 27; GDPR art. 20(2))', (_lang, Component, right, law, broader, gdprTitle, gdpr) => {
    const rows = page(Component).tables.flatMap((t) => t.rows);
    const row = rows.find((r) => right.test(r[0] ?? ''));
    expect(row?.[1]).toMatch(law);
    expect(row?.[1]).not.toMatch(broader);
    expect(section(Component, gdprTitle).text).toMatch(gdpr);
  });

  it.each([
    [
      'English', Terms,
      [/^5\.5 Indemnification$/, /^10\.\s*Disclaimers$/, /^11\.\s*Limitation of liability$/],
      /^Continued use of Postr after the effective date/,
      /^The following clause does not apply to consumers in Quebec to the extent that Quebec’s Consumer Protection Act prohibits it\.$/,
    ],
    [
      'French', TermsFr,
      [/^5\.5 Indemnisation$/, /^10\.\s*Exclusions de garantie$/, /^11\.\s*Limitation de responsabilité$/],
      /^La poursuite de l’utilisation de Postr après la date d’entrée en vigueur/,
      /^La clause qui suit ne s’applique pas aux consommateurs du Québec dans la mesure où la Loi sur la protection du consommateur l’interdit\.$/,
    ],
  ] as const)('%s Terms: each clause that may not apply to a Quebec consumer is immediately preceded by a prominent statement (CPA s. 19.1)', (_lang, Component, headings, continuedUse, statement) => {
    const notices = quebecNotices(Component, [...headings], continuedUse);
    expect(notices).toHaveLength(4);
    for (const notice of notices) {
      expect(notice.text, notice.name).toMatch(statement);
      // Prominent: the whole statement is set in bold.
      expect(notice.strong, notice.name).toBe(notice.text);
    }
  });

  it.each([
    ['PrivacyFr', PrivacyFr],
    ['CookiesFr', CookiesFr],
    ['TermsFr', TermsFr],
  ] as const)('%s reads as Quebec French', (_name, Component) => {
    const { text, tables } = page(Component);
    const anglicisms: Record<string, RegExp> = {
      'a price in English format (CA$18.99)': /CA\$/,
      '"pack" (lot)': /\bpacks?\b/i,
      '"marchand attitré"': /attitré/,
      '"délit" (responsabilité extracontractuelle)': /\bdélit\b/,
      '"honoraires juridiques" (extrajudiciaires)': /honoraires juridiques/,
      '"l’analytique" (mesure d’audience)': /analytique/,
      '"profilons"': /profilons/,
      '"Widgets"': /widgets?/i,
      'the expletive "ne" after "sans que"': /sans que [^.]{0,20}\bne\b/,
      '"Wikimedia Foundation"': /Wikimedia Foundation/,
      'a GDPR citation in English style, art. 6(1)(b)': /art\. \d+\(\d\)/,
      'a straight apostrophe': /'/,
    };
    const present = Object.entries(anglicisms).filter(([, p]) => p.test(text)).map(([n]) => n);
    expect(present).toEqual([]);
    expect(tables.flatMap((t) => t.headers)).not.toContain('Fin');
  });

  it.each([
    ['PrivacyFr', PrivacyFr],
    ['CookiesFr', CookiesFr],
    ['TermsFr', TermsFr],
  ] as const)('%s labels itself "Juridique", not "Légal"', (_name, Component) => {
    const { container, unmount } = render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );
    const label = container.querySelector('article div.uppercase')?.textContent?.trim();
    unmount();
    expect(label).toBe('Juridique');
  });
});

describe('English and French kept in step', () => {
  it.each([
    ['Privacy', Privacy, PrivacyFr],
    ['Cookies', Cookies, CookiesFr],
    ['Terms', Terms, TermsFr],
  ] as const)('%s: the same headings, list items, table rows and boxes', (_name, En, Fr) => {
    expect(page(Fr).shape).toEqual(page(En).shape);
  });
});
