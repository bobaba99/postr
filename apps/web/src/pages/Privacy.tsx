/**
 * Privacy Policy — public, GDPR-informed, plain-language.
 *
 * This document is a starting point drafted from standard GDPR
 * Art. 13/14 disclosures. Before going to production, it should be
 * reviewed by qualified data-protection counsel — several placeholders
 * below (legal entity, governing law, DPO contact) need to be filled
 * with real values from the business side, not invented here.
 */
import { Link } from 'react-router-dom';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';

const LAST_UPDATED = 'April 10, 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function Privacy() {
  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          Legal
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">Privacy Policy</h1>
        <p className="mt-4 text-sm text-[#6b7280]">Last updated: {LAST_UPDATED}</p>

        <Disclaimer />

        <SectionHeading n="1" title="Who we are" />
        <Body>
          Postr (“we”, “us”) is an academic poster editor operated by{' '}
          <strong className="text-[#e2e2e8]">Resila Technologies Inc.</strong>, a
          corporation registered in the Province of Quebec, Canada. If you have any
          question about how we handle your personal data — or want to exercise any
          of the rights described in Section 7 — contact us at{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </Body>
        <Body>
          We act as the <em>data controller</em> (the “enterprise” under Quebec
          law). Under Quebec’s Act respecting the protection of personal information
          in the private sector (the “Law 25” reform), the person responsible for
          the protection of personal information within Resila Technologies Inc. is
          reachable at the same address above. We will name a dedicated Data
          Protection Officer if and when legal thresholds require it.
        </Body>

        <SectionHeading n="2" title="What data we collect" />
        <Body>
          We try to collect as little as possible. Here is the full list, grouped by
          what happens when you interact with Postr:
        </Body>
        <Table
          headers={['When', 'What', 'Required?']}
          rows={[
            [
              'Anonymous first visit',
              'An anonymous account identifier, IP address (for abuse prevention), and browser user-agent.',
              'Yes — required for the app to work.',
            ],
            [
              'When you sign up',
              'Your email address and, if you sign in with Google, the basic profile returned by Google (name, email, avatar URL).',
              'Yes, if you choose to create a permanent account.',
            ],
            [
              'Profile details (optional)',
              'Display name, institution, department, ORCID ID, personal website.',
              'No — all optional, for pre-filling poster author info.',
            ],
            [
              'When you edit a poster',
              'The poster document itself: blocks, styles, authors, institutions, references, and any images you upload.',
              'Yes — this is the product.',
            ],
            [
              'When you use the figure-readability feature',
              'The R or Python plotting code you paste, sent to a language-model provider for analysis.',
              'Only if you choose to use the feature.',
            ],
            [
              'When you send feedback',
              'The title and body of your message, the page you were on, and your browser user-agent.',
              'Only if you submit feedback.',
            ],
            [
              'Technical logs',
              'Server and client error reports, approximate request timing, and request paths.',
              'Yes — for debugging and abuse prevention.',
            ],
          ]}
        />
        <Body>
          We do <strong>not</strong> intentionally collect any special-category data
          (health, biometric, political, religious, sexual orientation, ethnic origin,
          trade-union membership, genetic data). If you type such information into a
          poster block yourself, it is stored as the poster content you wrote — we do
          not process it further.
        </Body>

        <SectionHeading n="3" title="Why we process your data (and our legal basis)" />
        <Table
          headers={['Purpose', 'Legal basis', 'Data categories']}
          rows={[
            [
              'Running the editor, saving your drafts, enabling sign-in',
              'Contract (Art. 6(1)(b) GDPR)',
              'Account, poster content, technical logs',
            ],
            [
              'Debugging errors and preventing abuse',
              'Legitimate interest (Art. 6(1)(f) GDPR)',
              'Technical logs, IP, user-agent',
            ],
            [
              'Figure-readability analysis via third-party LLM',
              'Contract — the feature you invoked (Art. 6(1)(b))',
              'Plotting code you paste',
            ],
            [
              'Responding to support and feedback messages',
              'Legitimate interest (Art. 6(1)(f))',
              'Feedback content, contact info if you are signed in',
            ],
            [
              'Complying with legal obligations',
              'Legal obligation (Art. 6(1)(c))',
              'Whichever data is required by the specific obligation',
            ],
          ]}
        />
        <Body>
          We do not sell personal data, we do not run profiling or automated
          decision-making that produces legal or similarly significant effects, and we
          do not use your poster content to train any AI model.
        </Body>

        <SectionHeading n="4" title="Who receives your data" />
        <Body>
          We use a small set of carefully chosen service providers (“processors”) to
          run Postr. They only process your data under our instructions and for the
          purposes listed.
        </Body>
        <Table
          headers={['Provider', 'What it does', 'Location']}
          rows={[
            ['Supabase', 'Database, authentication, file storage', 'European Union (project region to be confirmed)'],
            ['Vercel', 'Web app hosting and edge delivery', 'Global (primarily United States)'],
            ['Render', 'Backend API hosting', 'United States'],
            ['Anthropic', 'LLM used for the figure-readability feature', 'United States'],
            ['Google (if you use Google sign-in)', 'Sign-in identity provider', 'Global'],
          ]}
        />
        <Body>
          We do not share your personal data with advertisers, data brokers, or social
          networks. If a legal authority issues a valid request compelling disclosure,
          we will comply, and will tell you unless we are legally prohibited from doing
          so.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Public gallery.</strong>
          <br />
          If you choose to publish a poster to the public gallery, or create a
          read-only share link, the poster content and any name you put on it
          becomes visible to anyone on the internet — including visitors who don’t
          have a Postr account. It may be indexed by search engines and cached by
          third parties. Retracting the poster removes it from Postr but cannot
          recall copies that others may have already made. Think before publishing.
          See Section 5.3 of the{' '}
          <Link to="/terms" className="text-[#7c6aed] underline">
            Terms of Service
          </Link>{' '}
          for the full rules.
        </CalloutBox>

        <SectionHeading n="5" title="International transfers" />
        <Body>
          Some of the processors above are based in the United States. When your data
          is transferred outside the European Economic Area, we rely on appropriate
          safeguards: Standard Contractual Clauses approved by the European Commission,
          and, where applicable, the EU–US Data Privacy Framework certification of the
          recipient. You can request a copy of the specific safeguards we rely on by
          emailing us.
        </Body>

        <SectionHeading n="6" title="How long we keep your data" />
        <Table
          headers={['Data', 'Retention']}
          rows={[
            [
              'Poster drafts and assets',
              'For as long as your account exists. Deleted immediately when you delete the poster or your account.',
            ],
            [
              'Anonymous guest accounts',
              'Deleted automatically 14 days after the last sign-in if never converted to a permanent account.',
            ],
            [
              'Feedback submissions',
              'Kept while the product is operated, so we can track history of reports and decisions.',
            ],
            [
              'Server/error logs',
              'Up to 30 days, then purged.',
            ],
            [
              'Legal/tax records',
              'As long as required by applicable law.',
            ],
          ]}
        />

        <SectionHeading n="7" title="Your rights" />
        <Body>
          Several privacy laws may apply to you depending on where you live. Postr
          is operated from Quebec, Canada, so the federal Personal Information
          Protection and Electronic Documents Act (PIPEDA) and Quebec’s Act
          respecting the protection of personal information in the private sector
          (“Law 25”) apply. If you are in the European Economic Area or the United
          Kingdom, the EU/UK GDPR applies. If you are in California, the California
          Consumer Privacy Act (CCPA) applies. Across these regimes you have the
          following rights over your personal data:
        </Body>
        <List
          items={[
            'Access — ask for a copy of the personal information we hold about you and the categories of people it has been shared with.',
            'Rectification — ask us to correct inaccurate or incomplete information.',
            'Erasure / de-indexing — ask us to delete your data or stop disseminating it, subject to legal exceptions.',
            'Restriction — ask us to pause processing while a dispute is resolved.',
            'Portability — ask for your data in a structured, commonly used, machine-readable format (GDPR and, since September 2024, Quebec Law 25).',
            'Objection — object to processing based on our legitimate interest.',
            'Withdraw consent — where processing is based on consent, withdraw it at any time without affecting processing already carried out.',
            'Non-discrimination (CCPA) — we will not treat you differently for exercising your CCPA rights.',
            'Lodge a complaint — with the appropriate regulator (see below).',
          ]}
        />
        <Body>
          You can file a complaint with the <strong>Commission d’accès à
          l’information du Québec (CAI)</strong> if you are a Quebec resident, the{' '}
          <strong>Office of the Privacy Commissioner of Canada (OPC)</strong> for
          matters under PIPEDA, your local EU data-protection authority under
          GDPR, the <strong>UK Information Commissioner’s Office (ICO)</strong>{' '}
          under UK GDPR, or the{' '}
          <strong>California Privacy Protection Agency (CPPA)</strong> under CCPA.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Right to object (Art. 21 GDPR).</strong>
          <br />
          You have the right to object at any time — on grounds relating to your
          particular situation — to processing of your personal data based on our
          legitimate interest, including any profiling. Send an email to{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </CalloutBox>
        <Body>
          To exercise any of these rights, email us at{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . We will respond within one month, as required by the GDPR. For most actions
          you can also use the buttons in your{' '}
          <Link to="/profile" className="text-[#7c6aed] underline">
            Profile page
          </Link>{' '}
          — deleting your account there erases everything associated with it.
        </Body>

        <SectionHeading n="8" title="Cookies and similar technologies" />
        <Body>
          We only set cookies and local-storage items that are strictly necessary to
          run the app — authenticating your session, remembering the poster you last
          opened, and preventing cross-site request forgery. These do not require
          consent under the ePrivacy Directive.
        </Body>
        <Body>
          We currently do not run third-party analytics or advertising trackers. If we
          add optional analytics in the future, we will update this notice and ask for
          your explicit consent before any non-essential cookies are set.
        </Body>

        <SectionHeading n="9" title="AI features and automated processing" />
        <Body>
          Postr offers an optional figure-readability feature that sends the R or
          Python plotting code you paste to a third-party large-language model
          (Anthropic Claude) for analysis. The response is used only to tell you
          whether your figure text will be legible at print size.
        </Body>
        <Body>
          No automated decisions with legal or similarly significant effects are made
          about you. Your poster content and profile data are never used to train any
          AI model.
        </Body>

        <SectionHeading n="10" title="Security" />
        <Body>
          We use encryption in transit (HTTPS everywhere), encryption at rest for
          database and storage, scoped service-role credentials, row-level security
          policies on every table, and least-privilege access for everyone who
          operates the service. No system is perfectly secure, but we take reasonable
          steps appropriate to the size of the service and the sensitivity of the
          data.
        </Body>

        <SectionHeading n="11" title="Children’s data" />
        <Body>
          Postr is intended for university students, postdocs, and professional
          researchers. We do not knowingly collect personal data from children under
          16. If you believe a child has provided personal data to us, contact{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          and we will delete it.
        </Body>

        <SectionHeading n="12" title="Changes to this notice" />
        <Body>
          We may update this Privacy Policy from time to time as the product evolves
          or the law changes. The “Last updated” date at the top of the page always
          reflects the current version. If a change is material, we will tell
          signed-in users by in-app notice or email before it takes effect.
        </Body>

        <SectionHeading n="13" title="Contact" />
        <Body>
          Questions, requests, or complaints about how we handle your personal data:{' '}
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
                className="border-b border-[#1f1f2e] px-4 py-3 text-left text-[12pt] font-semibold uppercase tracking-wide text-[#7c6aed]"
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
      <strong>Draft — pending legal review.</strong> This notice was drafted using
      standard GDPR Art. 13/14 disclosures and adapted for Canadian privacy law
      (PIPEDA + Quebec Law 25). It should still be reviewed by qualified
      data-protection counsel before Postr launches to paying users, and a French
      version must be provided to Quebec residents under the Charter of the
      French language. Questions:{' '}
      <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
        {CONTACT_EMAIL}
      </a>
      .
    </div>
  );
}
