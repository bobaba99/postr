/**
 * Privacy Policy — public, GDPR-informed, plain-language.
 *
 * This document is a starting point drafted from standard GDPR
 * Art. 13/14 disclosures. Before going to production, it should be
 * reviewed by qualified data-protection counsel — several placeholders
 * below (legal entity, governing law, DPO contact) need to be filled
 * with real values from the business side, not invented here.
 *
 * The data flows in Sections 2, 3, 4, 6, 8 and 9 were checked against
 * the code on 2026-10-05: every third party the browser or the API
 * sends data to, what Storage keeps after a poster or account is
 * deleted, and every use of the language model (apps/api/src/import.ts).
 * Adding a third party, a stored field or a new model call means
 * updating those sections here and in PrivacyFr.tsx in the same change.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

const LAST_UPDATED = 'October 6, 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function Privacy() {
  useDocumentMeta(STATIC_ROUTE_META['/privacy'] ?? null);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
            Legal
          </div>
          <Link to="/privacy/fr" className="text-[13px] text-[#7c6aed] underline">
            Français
          </Link>
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">Privacy Policy</h1>
        <p className="mt-4 text-sm text-[#8b8f99]">Last updated: {LAST_UPDATED}</p>


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
          Here is what we collect, grouped by what happens when you use Postr:
        </Body>
        <Table
          headers={['When', 'What', 'Required?']}
          rows={[
            [
              'Every visit',
              'Your IP address and browser user-agent reach our hosting providers with each request, as with any website, and can appear in their logs. Vercel Web Analytics also counts the page view, as Section 8 explains.',
              'Yes. This is how the site is delivered and counted.',
            ],
            [
              'When you open the editor, start as a guest, or send feedback',
              'An anonymous account identifier, created automatically so your work can be saved.',
              'Yes. The editor needs an account to save your work.',
            ],
            [
              'When you sign up',
              'Your email address; the password you choose, if you sign up with an email address, which our authentication provider stores only as a hash; and, if you sign in with Google, the basic profile returned by Google (name, email, avatar URL). We also record whether you agreed to product-research emails and product-update emails; both are off unless you tick them.',
              'Yes, if you choose to create a permanent account. The email choices are optional.',
            ],
            [
              'Profile details (optional)',
              'Display name, institution, department, ORCID ID, personal website. These are kept only in your browser, on that device. Our servers never receive them.',
              'No. All optional.',
            ],
            [
              'When you edit a poster',
              'The poster document itself (blocks, styles, authors, institutions, references), any images you upload, a preview image of the poster, logos you save to your logo library, and the versions of the poster you save.',
              'Yes. This is the product.',
            ],
            [
              'When you import a poster, copy a design, scan a figure, or paste authors or references',
              'The page images, figure images or pasted text you send, passed to a language-model provider (Anthropic) to read them. Section 9 explains each feature.',
              'Only if you use these features.',
            ],
            [
              'When you buy a plan',
              'Your plan, export credits, subscription status, the date of your first paid export, and the Stripe customer and subscription identifiers linked to your account. We send Stripe your email address and account identifier, and Stripe collects your payment details on its own pages. We never see your card number.',
              'Only if you buy a plan.',
            ],
            [
              'When you send feedback',
              'The title and body of your message, the full address of the page you were on, and your browser user-agent. If an import or a design copy fails and you report it, the file you were using and your browser’s console log are attached unless you untick them.',
              'Only if you submit feedback.',
            ],
            [
              'Technical logs',
              'Server logs of each request (the path, the result, how long it took, and your account identifier); error reports from the app (the error, where it happened, the poster identifier and the app version); and, when you import an image or a PDF without selectable text, up to 200 characters of the text read from it.',
              'Yes. For debugging and abuse prevention.',
            ],
          ]}
        />
        <Body>
          We do <strong>not</strong> intentionally collect any special-category data
          (health, biometric, political, religious, sexual orientation, ethnic origin,
          trade-union membership, genetic data). If you type such information into a
          poster block yourself, it is stored as the poster content you wrote. It goes
          to a language-model provider only if you send that content through one of
          the features in Section 9.
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
              'Technical logs, error reports, and the IP address and user-agent in our hosting providers’ logs',
            ],
            [
              'Counting page views, to see which pages people use',
              'Legitimate interest (Art. 6(1)(f))',
              'Page addresses with poster identifiers removed, and the address of the page you came from',
            ],
            [
              'Reading imported posters, copied designs, scanned figures, and pasted author or reference lists with a third-party language model',
              'Contract, as part of the feature you invoked (Art. 6(1)(b))',
              'The page images, figure images and text you send',
            ],
            [
              'Processing payments and managing your plan',
              'Contract (Art. 6(1)(b))',
              'Email address, account identifier, plan and billing records',
            ],
            [
              'Responding to support and feedback messages',
              'Legitimate interest (Art. 6(1)(f))',
              'Feedback content and anything you attach, contact info if you are signed in',
            ],
            [
              'Inviting you to product research (interviews, surveys), only if you opt in',
              'Consent (Art. 6(1)(a)), withdrawable at any time',
              'Email address, and any research responses you choose to give',
            ],
            [
              'Emailing you about new features and updates, only if you opt in',
              'Consent (Art. 6(1)(a)), withdrawable at any time',
              'Email address',
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
          do not use your poster content to train any AI model. We email you about
          product research or product updates only if you opted in. You can turn
          either off at any time on your Profile page, and doing so never affects your
          access to Postr.
        </Body>

        <SectionHeading n="4" title="Who receives your data" />
        <Body>
          The services below receive personal data when you use Postr. The table says
          what each one does and when it receives your data.
        </Body>
        <Table
          headers={['Provider', 'What it does', 'Location']}
          rows={[
            ['Supabase', 'Database, authentication, file storage', 'United States (Oregon)'],
            ['Vercel', 'Web app hosting and edge delivery, and page-view counting (Vercel Web Analytics)', 'Global (primarily United States)'],
            ['Render', 'Backend API hosting', 'United States or other countries (see Section 5)'],
            ['Anthropic', 'Language model that reads the images and text you send through the features in Section 9', 'United States'],
            ['Stripe (if you buy a plan)', 'Payments and subscriptions, as merchant of record', 'Global (primarily United States)'],
            ['Google', 'Sign-in, if you choose Google sign-in; the editor’s fonts (Google Fonts), loaded when you open the editor; the preset university logos (favicon service), when you open the logo picker, which shows the presets first', 'Global'],
            ['Wikimedia Foundation (if you pick a logo preset)', 'University logos from Wikidata, Wikipedia and Wikimedia Commons', 'Global (primarily United States)'],
          ]}
        />
        <Body>
          If you use the Staples print helper, your email provider (Gmail, Outlook.com
          or Yahoo Mail) opens a draft addressed to Staples with your poster’s title as
          the subject. Nothing is sent until you send it yourself.
        </Body>
        <Body>
          We do not share your personal data with advertisers, data brokers, or social
          networks. If a legal authority issues a valid request compelling disclosure,
          we will comply, and will tell you unless we are legally prohibited from doing
          so.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Sharing.</strong>
          <br />
          Postr has no public gallery and no share links at the moment. No control in
          the app publishes a poster or gives another Postr user access to it. If you
          published a poster to the gallery while it was open, you can retract it on
          your{' '}
          <Link to="/profile" className="text-[#7c6aed] underline">
            Profile page
          </Link>
          . Retracting deletes the entry and its files, but it cannot recall copies
          that others made while the poster was public.
        </CalloutBox>

        <SectionHeading n="5" title="International transfers" />
        <Body>
          Our database and file storage (Supabase) are in Oregon, in the United States,
          so your account, posters and files are stored in the United States, outside
          Quebec and Canada. The other services above, including our API host
          (Render), can process your data in the United States or in other countries. When your data
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
              'Posters and the versions you save',
              'Until you delete the poster or your account.',
            ],
            [
              'Images you upload to a poster, and poster preview images',
              'Until you delete your account. Deleting a poster does not delete these files.',
            ],
            [
              'Logos in your logo library',
              'Until you delete the logo or your account.',
            ],
            [
              'Images sent for import or design copying',
              'Uploaded to temporary storage for the language model to read, and deleted by the app when that step ends. Any that fail to delete stay until you delete your account.',
            ],
            [
              'Anonymous guest accounts',
              'A weekly job deletes guest accounts that were never converted to a permanent account, once 14 days have passed since their last sign-in. The job does not delete the files a guest uploaded.',
            ],
            [
              'Feedback submissions',
              'Kept while the product is operated, so we can track history of reports and decisions. They are kept after you delete your account; a file you attached is deleted with your account.',
            ],
            [
              'Record of an account deletion',
              'When you delete your account, we keep your account identifier, your Stripe customer identifier, the identifiers of any subscriptions we cancelled, and the number of files we removed. There is no set deletion date.',
            ],
            [
              'Copies in caches and backups',
              'Deleted data can remain in our providers’ caches and backups until those copies expire. Our providers set how long that takes; we have not set a shorter period.',
            ],
            [
              'Server/error logs',
              'Kept for as long as our hosting providers keep logs. We have not set a shorter period.',
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
          Kingdom, the EU/UK GDPR applies. If you are in California, you may also have
          rights under the California Consumer Privacy Act (CCPA). Across these regimes you have the
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
          . We will respond within one month, as required by the GDPR. Your{' '}
          <Link to="/profile" className="text-[#7c6aed] underline">
            Profile page
          </Link>{' '}
          also lets you download your account details, posters and feedback as a JSON
          file, change your email choices, and delete your account. Deleting your
          account cancels any subscription and deletes your account, your posters and
          your uploaded files. It ends a paid term straight away, without a refund for
          the rest of the period, and removes any unused export credits. Section 6
          lists what we keep afterwards.
        </Body>

        <SectionHeading n="8" title="Cookies and similar technologies" />
        <Body>
          Postr sets no cookies. It keeps a few items in your browser’s storage: your
          sign-in session, a marker that notices when the same poster is open in two
          tabs, short-lived values that last only for the current tab, and settings and
          notes you create, such as saved styles, palettes, scratch-pad notes, the
          plotting scripts you put into the figure check and your profile details. We
          use them only to run features you use, so we do not ask
          for consent before storing them. The{' '}
          <Link to="/cookies" className="text-[#7c6aed] underline">
            Cookies Policy
          </Link>{' '}
          describes them.
        </Body>
        <Body>
          We count page views with Vercel Web Analytics. It sets no cookie and writes
          nothing to your browser. Before a page address is sent, any poster identifier
          in it is replaced with a placeholder and the query string is removed. The
          address of the page you came from can also be sent, and Postr does not
          remove it. We run no advertising trackers. If we ever store or read anything on your device for
          an optional purpose, we will ask for your consent first.
        </Body>

        <SectionHeading n="9" title="AI features and automated processing" />
        <Body>
          Some Postr features send content to a third-party large language model,
          Anthropic’s Claude, which reads it and returns structured results:
        </Body>
        <List
          items={[
            'Importing a poster from a PDF or an image: an image of the page, or parts of it, so the model can find the figures, logos and text.',
            'Copy a design: an image of the poster you choose, so the model can identify its fonts and how its colors are used.',
            '“Scan image” in the editor’s Figure tab: the selected image, so the model can find its text and measure how large it will print.',
            'Pasting a list of authors or references: the pasted text, so the model can split it into names, affiliations and references.',
          ]}
        />
        <Body>
          Nothing is sent until you use one of these features. We use the results to
          fill in your poster in the editor, where you can change or remove them. The
          figure-readability check for pasted R or Python code runs in your browser and
          sends that code nowhere.
        </Body>
        <Body>
          No automated decisions with legal or similarly significant effects are made
          about you. We do not use your poster content to train any AI model, and your
          profile details never leave your browser.
        </Body>

        <SectionHeading n="10" title="Security" />
        <Body>
          We use encryption in transit (HTTPS everywhere), encryption at rest for
          database and storage, and row-level security policies on every table. The
          database’s full-access key is kept on our server and never sent to your
          browser. No system is perfectly secure, but we take reasonable
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
