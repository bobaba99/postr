/**
 * Cookies Policy — public, plain-language.
 *
 * Postr is a single-page app: most of what would traditionally be a
 * cookie is actually a localStorage entry. The ePrivacy Directive,
 * PIPEDA, and Quebec's Law 25 all cover "cookies and similar
 * technologies", so this policy uses that broader framing.
 *
 * Postr sets no cookie. The §3 table lists every localStorage and
 * sessionStorage key the app writes; pages/__tests__/
 * cookiesStorageInventory.test.ts fails when a file starts writing a
 * key the table (English or French) does not list, or the table names
 * a key the code never writes. The page states the owner's position
 * that every listed entry is strictly necessary; that position, not
 * the code, is what decides that no consent banner is shown.
 *
 * Page views ARE counted, via Vercel Web Analytics (added 2026-07-27).
 * As configured (no enableCookie, no identify) it writes nothing to
 * the device: MEASURED on www.postr.sh on 2026-10-06 (record 24: 0
 * localStorage and 0 sessionStorage keys, no cookie, after three page
 * views). The visitor hash and its 24-hour discard, and the approximate
 * location, device and browser Vercel may store with a page view, are
 * Vercel's documented behaviour (docs/analytics/privacy-policy), so the page
 * attributes them to Vercel (record 24 review round 2). It is not
 * mounted at all when the browser sends Global Privacy Control
 * (analytics/globalPrivacyControl.ts, App.tsx; owner decision 2026-10-06).
 * The production script sends the referring address only on the first
 * page view and only from another site (MEASURED, record 24), and
 * vercel.json's Referrer-Policy keeps the page path out of the beacon's
 * Referer header.
 *
 * If that ever changes — a real identifier, a cookie, anything
 * optional written to the browser — the banner promised in §4 is owed,
 * and this comment is the reminder. `analytics/redactUrl.ts` is the
 * other half: it strips share-link slugs and poster ids from the URL
 * the page-view event reports.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

const LAST_UPDATED = 'October 6, 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function Cookies() {
  useDocumentMeta(STATIC_ROUTE_META['/cookies'] ?? null);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
            Legal
          </div>
          <Link to="/cookies/fr" className="text-[13px] text-[#7c6aed] underline">
            Français
          </Link>
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">Cookies Policy</h1>
        <p className="mt-4 text-sm text-[#8b8f99]">Last updated: {LAST_UPDATED}</p>


        <SectionHeading n="1" title="Scope" />
        <Body>
          This Cookies Policy explains how <strong>Resila Technologies Inc.</strong>{' '}
          (the company behind Postr) uses cookies and similar client-side storage
          technologies on <a className="text-[#7c6aed] underline" href="https://postr.sh">postr.sh</a>. It
          supplements our{' '}
          <Link to="/privacy" className="text-[#7c6aed] underline">
            Privacy Policy
          </Link>
          .
        </Body>

        <SectionHeading n="2" title="What cookies (and similar technologies) are" />
        <Body>
          A <em>cookie</em> is a small text file a website asks your browser to
          store so that it can recognise you on a later page load. Modern web apps
          also use two related browser features, <em>localStorage</em> and{' '}
          <em>sessionStorage</em>, which do a similar job (remembering state from
          one page load to the next) but live in a different part of the browser.
          Wherever this policy says “cookies”, we mean cookies, localStorage, and
          sessionStorage collectively.
        </Body>
        <Body>
          Privacy regulators (CAI, CNIL, ICO, OPC) treat these technologies the
          same way as cookies. <strong>Strictly necessary</strong> storage can be
          used without asking. Optional storage, such as for advertising or
          third-party embeds, generally needs your{' '}
          <strong>prior, informed, freely-given consent</strong>, and the rules
          for analytics differ from one regulator to another.
        </Body>

        <SectionHeading n="3" title="What Postr uses today" />
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Everything Postr stores on your device is listed in the table below.
          </strong>
          <br />
          Each entry makes a Postr feature work or keeps something you saved,
          and none is used for advertising or to follow you across sites. We do
          not run Google Analytics, Facebook Pixel, advertising trackers or
          social-media share buttons. We do count page views with Vercel Web
          Analytics, and with nothing else. As Postr uses it, it sets no cookie
          and writes nothing to your browser, and Postr does not load it when
          your browser sends Global Privacy Control. Section 4 explains how it
          works.
        </CalloutBox>

        <Table
          headers={['Entry', 'Stored where', 'What it does', 'Lifetime']}
          rows={[
            [
              'sb-<project-ref>-auth-token',
              'localStorage',
              'Holds your sign-in session: the tokens that prove who you are and a copy of your account record. Without it, Postr cannot tell who you are or load your posters.',
              'Until you delete your account, the session ends, or you clear browser data',
            ],
            [
              'postr.style-presets, postr.custom-palettes, postr.checklist-templates, postr.scratch-pad, postr.scratch-note',
              'localStorage',
              'The style presets, colour palettes, checklist templates and Scratch Pad notes you save in the editor, so they are there on your next visit. The style-presets entry is created empty the first time you open the editor.',
              'Until you delete them, delete your account in this browser, or clear browser data.',
            ],
            [
              'postr.profile',
              'localStorage',
              'The profile details you enter on your Profile page: name, institution, department, ORCID and website. They are kept only in this browser and are not sent to our servers.',
              'Until you delete your account or clear browser data',
            ],
            [
              'postr.onboarding-done, postr.cb-random-pref',
              'localStorage',
              'Remember that you finished or skipped the editor tour, and whether random palettes should be colour-blind friendly.',
              'Until you delete your account in this browser or clear browser data. Choosing Replay tour on your Profile page also clears the tour entry.',
            ],
            [
              'postr.welcome-seeded:<account id>',
              'localStorage',
              'Records that your welcome poster was created, so it is not created again. The key name contains your account id.',
              'Until you delete that account in this browser or clear browser data',
            ],
            [
              'postr.active-editor.<poster id>',
              'localStorage',
              'Lets Postr warn you when the same poster is open in two tabs. The key name contains the poster id, or “new” when the editor opens at /p/new. The entry holds a random tab id and the time the poster was last open.',
              'Until you delete your account in this browser or clear browser data',
            ],
            [
              'postr.figure-script.<poster id>',
              'localStorage',
              'The plotting script you put into a poster’s figure check, its language, and the script, size and image block of your last check, so they are still there when you come back to that poster. The key name contains the poster id. They are kept only in this browser and are not sent to our servers.',
              'Until you empty the code box, delete the poster or your account in this browser, or clear browser data. Only the 10 most recently changed posters keep a script. A very long script is not stored: it is lost when you reload the page or close the tab.',
            ],
            [
              'postr.tab-id',
              'sessionStorage',
              'A random id for this tab, used by the two-tab warning.',
              'Until you close the tab',
            ],
            [
              'postr.figure-script-page, postr.figure-size-page',
              'sessionStorage',
              'On the plot checker page, the script you put in, its language, your last check and the printed size you typed, so reloading the page keeps them.',
              'Until you close the tab. A very long script is not stored: it is lost when you reload the page.',
            ],
            [
              'postr.signupConsent, postr.checkoutIntent',
              'sessionStorage',
              'Carry your research and marketing email choices, and the plan you picked, through sign-up, including a sign-in with Google.',
              'Until they are used or you close the tab',
            ],
            [
              'postr.autoArrangeOnLoad',
              'sessionStorage',
              'Tells the editor to tidy the layout of a poster you just imported. Holds that poster’s id.',
              'Until the editor reads it or you close the tab',
            ],
            [
              'postr-just-refreshed, postr-acknowledged-build, postr.mobile-notice-dismissed',
              'sessionStorage',
              'Remember your answer to the notice about a new version of Postr, and that you closed the notice shown on phone-size screens, so neither comes back in this tab.',
              'Until you close the tab at the latest',
            ],
          ]}
        />
        <Body>
          The sign-in library also writes a test entry named lswt-… and deletes it
          straight away, to check that your browser allows storage. It is not kept.
        </Body>
        <Body>
          We treat all of these as falling under the “strictly necessary to
          provide the service the user explicitly requested” exemption in Article
          5(3) of the ePrivacy Directive and the equivalent provisions of PIPEDA
          and Quebec Law 25, so Postr shows no consent banner. None of them track
          you across other sites, and Postr itself sets no cookies at all.
        </Body>
        <Body>
          Some features load files straight from other services, which have their
          own cookie policies. The editor loads poster fonts from Google Fonts:
          each time it does, your browser sends Google your IP address and user
          agent, as with any request. The public pages do not load Google Fonts.
          The logo picker opens on its Presets tab, which loads university icons
          from Google, and a logo you pick there is loaded from Wikimedia sites
          or, failing that, from Google. Signing in with Google opens Google’s
          sign-in pages, which have their own cookie policy. Payments and billing
          open on Stripe’s own pages.
        </Body>

        <SectionHeading n="4" title="Page counting, and what Postr still does not use" />
        <Body>
          Postr counts page views with{' '}
          <strong className="text-[#e2e2e8]">Vercel Web Analytics</strong>, so we
          can see which pages people find useful. It is worth being precise about
          what that does and does not involve. As Postr uses it, it sets{' '}
          <strong>no cookie</strong> and writes nothing to your browser. Each page
          view sends Vercel the page address, along with what every web request
          carries, such as your IP address and browser type. On the first page
          you open, it also sends the address of the website that sent you to
          Postr, if any; it never sends a Postr page as that address. Vercel’s
          documentation says it may record with each page view an approximate
          location (country, region and city), the device type, the operating
          system and the browser. It also says it tells
          visits apart with a value derived from the request and discards that
          value within 24 hours.
        </Body>
        <Body>
          In the page address it reports, Postr replaces poster and admin pages
          with their shape, for example{' '}
          <code className="text-[#c8b6ff]">/p/[redacted]</code> in place of your
          poster’s id, and drops query strings entirely. Postr’s pages also tell
          your browser to send only the site’s address (https://www.postr.sh/),
          not the page’s path, with the counting request.
        </Body>
        <List
          items={[
            'Advertising cookies: there are no ads on Postr.',
            'Google Analytics, Matomo, PostHog or Plausible: none of these.',
            'Cross-site tracking or fingerprinting: we do not profile you between visits or across other websites.',
            'Social-media widgets: no Facebook, Twitter or LinkedIn buttons that phone home.',
            'Advertising or tracking identifiers: the only ids Postr stores on your device are the ones in the table above, each used by the feature described next to it.',
            'Recording your poster contents in analytics, or poster ids and query strings in the page address Postr reports.',
          ]}
        />
        <Body>
          If we ever add something that <em>does</em> store or read data on your
          device for optional purposes, we will update this policy, display a
          consent banner with equally-visible “Accept” and “Reject” choices, and
          refrain from setting any non-essential storage until you click
          “Accept”.
        </Body>

        <SectionHeading n="5" title="How to control cookies" />
        <Body>
          Deleting these entries signs you out. It also removes the presets,
          palettes, templates, Scratch Pad notes, plotting scripts and profile
          details that are kept only in your browser. The posters, feedback and
          settings saved with your account stay on our servers, and your posters
          and settings come back when you sign in again. If you use Postr as a
          guest, without an account, the sign-in session is the only key to your
          posters: once it is deleted, you can no longer open them.
        </Body>
        <Body>
          You can clear Postr’s storage in the usual ways for your browser:
        </Body>
        <List
          items={[
            'Chrome: Settings → Privacy and security → Third-party cookies → See all site data and permissions → search "postr.sh" → Delete.',
            'Edge: open Settings, search for "cookies", open the list of all cookies and site data, then search "postr.sh" and delete it.',
            'Firefox: Settings → Privacy and security → Clear data for specific sites → search "postr.sh" → Remove Selected → Save Changes.',
            'Safari: Settings → Privacy → Manage Website Data → search "postr.sh" → Remove.',
            'Mobile: follow your browser’s instructions for clearing site data.',
          ]}
        />
        <Body>
          Most browsers also let you block cookies and other site data, either
          for every site or only for third parties. If you block storage for
          postr.sh, Postr cannot keep you signed in from one page load to the
          next, and the editor may not work.
        </Body>

        <SectionHeading n="6" title="Global Privacy Control and Do Not Track" />
        <Body>
          Postr honours <em>Global Privacy Control</em> (GPC), a privacy setting
          offered by some browsers, such as Firefox, Brave and DuckDuckGo. When
          your browser sends it, Postr does not load Vercel Web Analytics, so your
          page views are not counted. Page counting is the only optional thing
          GPC could switch off: Postr runs no advertising and no cross-site
          tracking. Postr does not read the older “Do Not Track” (DNT) header; turn
          on GPC instead. You can also object to page counting by writing to{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </Body>

        <SectionHeading n="7" title="Retention" />
        <Body>
          Each entry in the table above lasts for the lifetime listed there.
          Postr sets no expiry date on its localStorage entries, so each one
          stays until the event in the table happens, however long that takes.
          The sessionStorage entries end when you close the tab, if not before.
          If we ever add a consent cookie, it will expire after{' '}
          <strong>6 months</strong>, in line with CNIL’s recommendation.
        </Body>

        <SectionHeading n="8" title="Changes to this policy" />
        <Body>
          We may update this Cookies Policy as the product evolves. The “Last
          updated” date at the top reflects the current version. If a change is
          material, such as the first time we introduce an analytics or
          advertising cookie, we will show a clear notice in the app before the
          change takes effect.
        </Body>

        <SectionHeading n="9" title="Contact" />
        <Body>
          Questions about cookies or this policy:{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </Body>
      </article>

      <PublicFooter />
    </main>
  );
}

// ── Shared building blocks ──────────────────────────────────────────

function SectionHeading({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="mt-12 mb-4 text-xl font-semibold text-[#e2e2e8]">
      <span className="mr-3 font-mono text-[#7c6aed]">{n}.</span>
      {title}
    </h2>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[14pt] leading-relaxed text-[#9ca3af]">{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mb-4 list-disc space-y-2 pl-6 text-[14pt] leading-relaxed text-[#9ca3af] marker:text-[#7c6aed]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mb-4 overflow-x-auto rounded-lg border border-[#1f1f2e]">
      <table className="w-full border-collapse text-[14pt]">
        <thead>
          <tr className="bg-[#111118]">
            {headers.map((h, i) => (
              <th
                key={i}
                className="border-b border-[#1f1f2e] px-4 py-3 text-left font-semibold uppercase tracking-wide text-[#7c6aed]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="bg-[#0a0a12]">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-[#1f1f2e] px-4 py-3 align-top leading-relaxed text-[#9ca3af]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalloutBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-lg border-l-4 border-[#7c6aed] bg-[#111118] p-5 text-[14pt] leading-relaxed text-[#9ca3af]">
      {children}
    </div>
  );
}
