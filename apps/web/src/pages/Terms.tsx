/**
 * Terms of Service — public, plain-language.
 *
 * This document is a starting point. Several placeholders (legal
 * entity name, governing law, dispute-resolution jurisdiction) must
 * be filled in and the document reviewed by qualified counsel before
 * Postr launches to a paying audience.
 *
 * The "Your content" section is deliberately strict to cover the
 * public gallery feature: users represent that they are the rightful
 * owners, they grant Postr a limited display license, and they
 * indemnify Postr against third-party copyright claims.
 */
import { Link } from 'react-router-dom';

const LAST_UPDATED = 'April 10, 2026';
const CONTACT_EMAIL = 'hello@postr.sh';

export default function Terms() {
  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <Header />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          Legal
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">Terms of Service</h1>
        <p className="mt-4 text-sm text-[#6b7280]">Last updated: {LAST_UPDATED}</p>

        <Disclaimer />

        <SectionHeading n="1" title="Agreement" />
        <Body>
          These Terms of Service (“Terms”) form a legal agreement between you and
          Postr (“we”, “us”), operated by{' '}
          <strong className="text-[#e2e2e8]">Resila Technologies Inc.</strong>, a
          corporation registered in the Province of Quebec, Canada. By creating an
          account, signing in, or otherwise using Postr — including browsing the
          public gallery without an account — you agree to these Terms and to our{' '}
          <Link to="/privacy" className="text-[#7c6aed] underline">
            Privacy Policy
          </Link>
          . If you do not agree, do not use the service.
        </Body>

        <SectionHeading n="2" title="What Postr is" />
        <Body>
          Postr is an academic poster editor and sharing platform. It lets you
          create conference-quality posters, store drafts, share read-only links,
          submit feedback, and — if you choose — publish posters to a public gallery
          so that other users and visitors can see them.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Postr is a sharing platform, not a publisher.
          </strong>
          <br />
          We host and display the content you upload. We do not review it for accuracy,
          originality, or lawful use before it goes live. You are solely responsible
          for what you publish — see Section 5 below.
        </CalloutBox>

        <SectionHeading n="3" title="Accounts" />
        <List
          items={[
            'You may start using Postr with an anonymous session and convert it to a permanent account later. All progress migrates across.',
            'You must provide accurate sign-up information and keep your login credentials confidential.',
            'You must be at least 16 years old (or the minimum age of digital consent in your country) to create a permanent account.',
            'You are responsible for everything that happens under your account.',
            'You can delete your account at any time from your Profile page. Deletion is permanent and immediate.',
          ]}
        />

        <SectionHeading n="4" title="Acceptable use" />
        <Body>You agree not to use Postr to:</Body>
        <List
          items={[
            'Upload, publish, or share content that infringes copyright, trademark, patent, trade-secret, privacy, publicity, or any other third-party right.',
            'Upload, publish, or share content that is defamatory, harassing, threatening, discriminatory, or promotes violence.',
            'Upload, publish, or share content that contains unlawful material, malware, or links to malware.',
            'Impersonate any person or entity or misrepresent your affiliation with one.',
            'Attempt to probe, scan, or test the vulnerability of the service, bypass authentication, or disrupt other users.',
            'Abuse the feedback system, rate-limit workarounds, or automated scraping beyond what a normal user would do.',
            'Use Postr to train machine-learning models on other users’ content.',
          ]}
        />
        <Body>
          We may suspend or terminate accounts — and remove content — that violate
          these rules, with or without notice, at our sole discretion.
        </Body>

        <SectionHeading n="5" title="Your content" />
        <Body>
          You keep full ownership of the posters, figures, images, text, and any
          other material you create or upload on Postr (“Your Content”). Nothing in
          these Terms transfers intellectual-property rights from you to us.
        </Body>

        <SubHeading>5.1 Your warranties</SubHeading>
        <Body>
          By uploading, publishing, or sharing anything on Postr, you{' '}
          <strong>represent and warrant</strong> that:
        </Body>
        <List
          items={[
            'You are the rightful owner of Your Content, or you have obtained every licence, permission, and release necessary to use it — including for figures copied from your own published papers, images of co-authors, institutional logos, and third-party datasets.',
            'Your Content does not infringe any copyright, trademark, patent, trade secret, privacy right, publicity right, or other right of any third party.',
            'Your Content complies with all applicable laws, including research-ethics and data-protection rules of your institution and jurisdiction.',
            'If Your Content contains personal data about anyone other than yourself (co-authors, study participants, etc.), you have a lawful basis and the necessary consents to display it on Postr.',
          ]}
        />

        <SubHeading>5.2 Licence you grant to us</SubHeading>
        <Body>
          Solely to operate the service, you grant Postr a{' '}
          <strong>
            worldwide, royalty-free, non-exclusive, limited licence to host, store,
            reproduce, display, and transmit Your Content
          </strong>{' '}
          as necessary to provide the features you use — for example, saving your
          drafts, generating previews, delivering share links to people you invite,
          and displaying your posters in the public gallery when you choose to publish
          them.
        </Body>
        <Body>
          This licence ends when you delete the relevant content or your account,
          except (a) for copies that normal technical caches and backups retain for a
          short period, and (b) for shared content that third parties may have already
          viewed or downloaded while it was public.
        </Body>

        <SubHeading>5.3 The public gallery — read carefully</SubHeading>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Anything you publish to the gallery is public.
          </strong>
          <br />
          It can be viewed by anyone on the internet, including people who do not
          have a Postr account. It may be indexed by search engines. It may be
          cached or linked to by third parties you do not control. Think before
          publishing — especially if the poster contains unpublished results,
          embargoed data, or anything your collaborators or institution would not
          want made public.
        </CalloutBox>
        <Body>
          By choosing to publish a poster (either one created in Postr or a PDF/image
          you uploaded), you confirm each of the following:
        </Body>
        <List
          items={[
            'You are the rightful owner of every element of the poster — text, figures, photos, logos, data — or you have written permission from every rights-holder to display them publicly.',
            'All co-authors named on the poster have agreed to its public display.',
            'You are not publishing confidential, embargoed, or export-controlled material.',
            'You will retract the poster promptly if any of the above ceases to be true.',
          ]}
        />
        <Body>
          You can retract (unpublish or delete) any poster at any time from your
          dashboard. Once retracted, it will no longer be served from Postr, but we
          cannot recall copies that third parties may already have made.
        </Body>

        <SubHeading>5.4 Copyright and DMCA-style takedowns</SubHeading>
        <Body>
          If you believe content on Postr infringes your copyright, email{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          with: a description of the work you own, a URL to the allegedly infringing
          content on Postr, your contact information, and a statement that you have a
          good-faith belief the use is not authorised. We will review and respond
          within a reasonable time and may remove or disable the content while we
          investigate. Repeat infringers will have their accounts terminated.
        </Body>

        <SubHeading>5.5 Indemnification</SubHeading>
        <Body>
          You agree to defend, indemnify, and hold Postr and its operator harmless
          from any claim, demand, loss, damage, cost, or expense (including
          reasonable legal fees) arising out of or related to Your Content — in
          particular claims that Your Content infringes intellectual-property rights,
          privacy rights, or publicity rights of any third party. To the extent
          applicable law caps or restricts this indemnity, it is limited accordingly.
        </Body>

        <SectionHeading n="6" title="Postr’s content and trademarks" />
        <Body>
          The Postr software, branding, logo, palette, fonts we shipped, and the
          built-in templates are owned by us (or used under licence). You may use
          them only as necessary to operate and share posters you create on Postr.
          You may not reuse our brand assets for other products or services without
          written permission.
        </Body>

        <SectionHeading n="7" title="Fees" />
        <Body>
          Postr is currently free to use. If we introduce paid plans in the future,
          we will update these Terms and notify signed-in users before any charge is
          made. Use of the service while it is free does not grant you any right to
          continued free use in the future.
        </Body>

        <SectionHeading n="8" title="Feedback" />
        <Body>
          If you submit feedback, bug reports, or feature requests through the
          in-app feedback tool, you grant us the right to use that feedback to
          improve the service, without obligation to you or payment. Do not include
          confidential material in feedback messages.
        </Body>

        <SectionHeading n="9" title="Availability, changes, and termination" />
        <List
          items={[
            'We may change, suspend, or discontinue any part of Postr at any time, with or without notice.',
            'We do not guarantee uninterrupted availability. Planned maintenance, emergency fixes, and third-party outages will happen.',
            'You can stop using Postr at any time. We can terminate your account for material breach of these Terms or prolonged inactivity of an anonymous guest session.',
            'Sections that by their nature should survive termination (for example, Your warranties, indemnification, disclaimers, and limitation of liability) will survive.',
          ]}
        />

        <SectionHeading n="10" title="Disclaimers" />
        <CalloutBox>
          <strong className="text-[#e2e2e8]">“As is” and “as available”.</strong>
          <br />
          Postr is provided without warranties of any kind, express or implied,
          including (to the maximum extent permitted by law) warranties of
          merchantability, fitness for a particular purpose, non-infringement, and
          uninterrupted or error-free operation. The figure-readability feature is a
          helpful guide, not a guarantee that your poster will print correctly.
        </CalloutBox>

        <SectionHeading n="11" title="Limitation of liability" />
        <Body>
          To the maximum extent permitted by applicable law, Postr and its operator
          will not be liable for any indirect, incidental, special, consequential,
          or punitive damages, or any loss of profits, revenue, data, or goodwill,
          arising from or relating to your use of the service — whether based on
          contract, tort (including negligence), statute, or any other legal theory,
          and whether or not we were advised of the possibility of such damages.
        </Body>
        <Body>
          Nothing in these Terms limits liability for death or personal injury
          caused by our negligence, fraud or fraudulent misrepresentation, or any
          other liability that cannot be limited or excluded under applicable law.
        </Body>

        <SectionHeading n="12" title="Governing law and disputes" />
        <Body>
          These Terms are governed by the laws of the Province of Quebec and the
          federal laws of Canada applicable therein, without regard to
          conflict-of-laws rules. Any dispute arising from these Terms or your use
          of Postr will be brought exclusively before the courts sitting in the
          judicial district of Montréal, Quebec, except where mandatory
          consumer-protection laws in your country of residence grant you the
          right to bring proceedings locally.
        </Body>

        <SectionHeading n="13" title="Changes to these Terms" />
        <Body>
          We may update these Terms as the product evolves or the law changes. The
          “Last updated” date at the top always reflects the current version. If a
          change materially affects your rights, we will tell signed-in users in the
          app or by email before it takes effect. Continued use of Postr after the
          effective date means you accept the updated Terms.
        </Body>

        <SectionHeading n="14" title="Contact" />
        <Body>
          Questions, notices, or legal requests:{' '}
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

function Header() {
  return (
    <header className="flex items-center justify-between px-8 py-5">
      <Link to="/" className="flex items-center gap-3 no-underline">
        <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="12" fill="#7c6aed" />
          <path d="M14 14 C32 14, 32 50, 50 50" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.95" />
          <path d="M14 50 C32 50, 32 14, 50 14" stroke="white" strokeWidth="4.5" strokeLinecap="round" opacity="0.55" />
          <circle cx="32" cy="32" r="5" fill="white" />
        </svg>
        <span className="text-xl font-bold text-[#c8cad0]">Postr</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link to="/about" className="text-sm text-[#6b7280] no-underline hover:text-[#c8cad0]">
          About
        </Link>
        <Link
          to="/auth"
          className="rounded-lg border border-[#7c6aed] px-5 py-2 text-sm font-semibold text-[#7c6aed] no-underline hover:bg-[#7c6aed] hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-[#1f1f2e] px-8 py-6 text-center text-sm text-[#555]">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <Link to="/" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Home
        </Link>
        <Link to="/about" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          About
        </Link>
        <Link to="/privacy" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Privacy
        </Link>
        <Link to="/cookies" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Cookies
        </Link>
        <Link to="/terms" className="no-underline text-[#6b7280] hover:text-[#c8cad0]">
          Terms
        </Link>
      </div>
    </footer>
  );
}

function SectionHeading({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="mt-12 mb-4 text-xl font-semibold text-[#e2e2e8]">
      <span className="mr-3 font-mono text-[#7c6aed]">{n}.</span>
      {title}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-3 text-[15px] font-semibold text-[#c8cad0]">{children}</h3>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[15px] leading-relaxed text-[#9ca3af]">{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mb-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-[#9ca3af] marker:text-[#7c6aed]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function CalloutBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-lg border-l-4 border-[#7c6aed] bg-[#111118] p-5 text-[14px] leading-relaxed text-[#9ca3af]">
      {children}
    </div>
  );
}

function Disclaimer() {
  return (
    <div className="mt-6 rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-5 text-[13px] leading-relaxed text-[#f59e0b]">
      <strong>Draft — pending legal review.</strong> This document should still be
      reviewed by qualified counsel before Postr launches to paying users, and a
      French version must be provided to Quebec residents under the Charter of
      the French language.
    </div>
  );
}
