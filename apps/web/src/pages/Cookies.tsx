/**
 * Cookies Policy — public, plain-language.
 *
 * Postr is a single-page app: most of what would traditionally be a
 * cookie is actually a localStorage entry. The ePrivacy Directive,
 * PIPEDA, and Quebec's Law 25 all cover "cookies and similar
 * technologies", so this policy uses that broader framing.
 *
 * Today Postr only uses strictly-necessary technologies — no analytics,
 * no advertising, no social trackers. Keeping the policy short and
 * honest is intentional; it will grow (and a consent banner will
 * appear) the first time we add anything that requires opt-in.
 */
import { Link } from 'react-router-dom';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';

const LAST_UPDATED = 'April 10, 2026';
const CONTACT_EMAIL = 'hello@postr.sh';

export default function Cookies() {
  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          Legal
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">Cookies Policy</h1>
        <p className="mt-4 text-sm text-[#6b7280]">Last updated: {LAST_UPDATED}</p>

        <Disclaimer />

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
          also use related browser features — <em>localStorage</em> and{' '}
          <em>sessionStorage</em> — which serve the same purpose (remembering state
          between visits) but live in a different part of the browser. Wherever this
          policy says “cookies”, we mean cookies, localStorage, and sessionStorage
          collectively.
        </Body>
        <Body>
          Regulators (CAI, CNIL, ICO, OPC) treat these technologies the same way:
          <strong> strictly necessary</strong> storage can be used without asking,
          but anything optional — analytics, advertising, third-party embeds —
          requires your <strong>prior, informed, freely-given consent</strong>.
        </Body>

        <SectionHeading n="3" title="What Postr uses today" />
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Postr currently uses only strictly-necessary storage.</strong>
          <br />
          We do not run Google Analytics, Facebook Pixel, advertising trackers,
          social-media share buttons with tracking, or any other optional
          technology. No consent banner is shown because none of the entries below
          require consent under GDPR, the ePrivacy Directive, PIPEDA, or Quebec
          Law 25.
        </CalloutBox>

        <Table
          headers={['Entry', 'Stored where', 'What it does', 'Lifetime']}
          rows={[
            [
              'sb-<project-ref>-auth-token',
              'localStorage',
              'Holds your Supabase authentication session (JWT + refresh token). Without it, the app cannot tell who you are and your drafts cannot be loaded.',
              'Until you sign out or the session expires',
            ],
            [
              'postr-onboarding-*',
              'localStorage',
              'Remembers whether you have seen the onboarding tour so we do not show it again on every visit.',
              'Until you clear browser data',
            ],
            [
              'postr-templates',
              'localStorage',
              'Holds custom poster templates you save from the editor’s Scratch Pad so they are available on your next visit.',
              'Until you delete the template or clear browser data',
            ],
            [
              'Supabase refresh/session timers',
              'sessionStorage',
              'Short-lived technical flags used by the Supabase client to coordinate token refresh between tabs.',
              'Until you close the browser tab',
            ],
          ]}
        />
        <Body>
          All of these fall under the “strictly necessary to provide the service
          the user explicitly requested” exemption in Article 5(3) of the
          ePrivacy Directive and the equivalent provisions of PIPEDA and Quebec
          Law 25. None of them track you across other sites.
        </Body>

        <SectionHeading n="4" title="What Postr does not use" />
        <List
          items={[
            'Advertising cookies — there are no ads on Postr.',
            'Third-party analytics — no Google Analytics, no Matomo, no PostHog, no Plausible.',
            'Cross-site tracking or fingerprinting — we do not profile you between visits or across other websites.',
            'Social-media widgets — no Facebook, Twitter, or LinkedIn buttons that phone home.',
            'Persistent identifiers beyond what your authentication session requires.',
          ]}
        />
        <Body>
          If we ever add optional analytics or any other non-essential technology,
          we will update this policy, display a consent banner with equally-visible
          “Accept” and “Reject” choices, and refrain from setting any non-essential
          storage until you click “Accept”.
        </Body>

        <SectionHeading n="5" title="How to control cookies" />
        <Body>
          Because Postr currently only stores what is strictly necessary for
          sign-in and editing, deleting these entries will sign you out and
          discard your locally-saved templates and onboarding state. Your
          server-side data (posters, profile, feedback) is unaffected.
        </Body>
        <Body>
          You can clear Postr’s storage in the usual ways for your browser:
        </Body>
        <List
          items={[
            'Chrome / Edge: Settings → Privacy and security → Cookies and other site data → See all site data and permissions → search "postr.sh" → Delete.',
            'Firefox: Settings → Privacy & Security → Cookies and Site Data → Manage Data → search "postr.sh" → Remove.',
            'Safari: Settings → Privacy → Manage Website Data → search "postr.sh" → Remove.',
            'Mobile: follow your browser’s instructions for clearing site data.',
          ]}
        />
        <Body>
          Most browsers also let you block all cookies, block third-party cookies,
          or receive a prompt before each cookie is set. Blocking strictly-necessary
          cookies will prevent Postr from working.
        </Body>

        <SectionHeading n="6" title="Do Not Track and Global Privacy Control" />
        <Body>
          We respect “Do Not Track” (DNT) headers and the newer{' '}
          <em>Global Privacy Control</em> (GPC) signal. Today these signals have
          nothing to opt out of, since we do not run analytics or targeted
          advertising. If we ever introduce optional tracking, receiving DNT or
          GPC from your browser will be treated as an automatic opt-out.
        </Body>

        <SectionHeading n="7" title="Retention" />
        <Body>
          Each entry in the table above lives until the lifetime listed there.
          None of them outlive 13 months, which is the maximum retention period
          allowed for consent records under French CNIL guidance and a common
          reference across EU regulators. When we add a consent cookie in the
          future, we will default it to <strong>6 months</strong> in line with
          CNIL’s recommendation.
        </Body>

        <SectionHeading n="8" title="Changes to this policy" />
        <Body>
          We may update this Cookies Policy as the product evolves. The “Last
          updated” date at the top reflects the current version. If a change is
          material — for example, the first time we introduce an analytics or
          advertising cookie — we will show a clear notice in the app before the
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

function Disclaimer() {
  return (
    <div className="mt-6 rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-5 text-[14pt] leading-relaxed text-[#f59e0b]">
      <strong>Draft — pending legal review.</strong> This policy describes what
      Postr actually stores today (strictly-necessary entries only). It should be
      reviewed by qualified counsel before launch, and a French version must be
      provided to Quebec residents under the Charter of the French language.
    </div>
  );
}
