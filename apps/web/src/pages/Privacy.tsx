/**
 * Privacy Policy — public, plain-language, Canada first.
 *
 * Written for Quebec's Act respecting the protection of personal
 * information in the private sector ("Law 25") and PIPEDA first, then the
 * EU/UK GDPR and US state law (owner decisions of 2026-10-06; record
 * docs/fixes/24-legal-canada-law25.md). Everything Law 25 asks a business
 * to publish is here: the person in charge, published as a ROLE of Resila
 * Technologies Inc. (never a person's name or title: owner, 2026-10-06),
 * the governance policies, what is collected and by what means, the
 * recipients, communication outside Quebec, the rights and how to use
 * them, technology that identifies, locates or profiles (none, apart from
 * the approximate location Vercel's documentation says it may record with a
 * page view: §6-§7, record 24 review round 2), automated decisions, and
 * privacy by default (page counting is on by default, so §8 does not list
 * it among the private defaults).
 *
 * Every data flow below was read from the code on 2026-10-06: the
 * recipients (Vercel, Render and Supabase first, then every other host the
 * browser or the API reaches), what each receives, what is kept and for how
 * long, and every use of the language model (apps/api/src/import.ts,
 * extractStyle.ts). docs/legal/quebec-law-25.md holds the file references.
 * pages/__tests__/legalPagesContent.test.tsx checks the required elements.
 * Adding a recipient, a stored field, a browser entry or a model call means
 * updating this page, PrivacyFr.tsx and the internal file in the same change.
 * No claim the code cannot back: no hosting region, no signed contract
 * clauses, no retention period the code does not enforce.
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

        <div className="mt-8">
          <Body>
            This policy explains what personal information Postr collects, why, who
            receives it, how long it is kept, and how you can use your rights. Postr is
            run from Quebec, Canada, so this policy follows Quebec’s Act respecting the
            protection of personal information in the private sector (“Law 25”) and
            Canada’s Personal Information Protection and Electronic Documents Act
            (PIPEDA). Sections 15 and 16 add what applies if you are in the European
            Union, the United Kingdom or the United States.
          </Body>
        </div>

        <SectionHeading n="1" title="Who is responsible for your information" />
        <Body>
          Postr is a poster editor for researchers. It is run by{' '}
          <strong className="text-[#e2e2e8]">Resila Technologies Inc.</strong>{' '}
          (“Resila”, “we”, “us”), a corporation incorporated in Quebec, Canada.
          Resila is responsible for the personal information Postr collects.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Person in charge of the protection of personal information (Privacy
            Officer), Resila Technologies Inc.
          </strong>
          <br />
          Email:{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          <br />
          Write to the Privacy Officer with any question, request or complaint about
          your personal information.
        </CalloutBox>

        <SectionHeading n="2" title="What we collect, and how" />
        <Body>
          The table lists everything Postr collects, when it happens, and how.
        </Body>
        <Table
          headers={['When', 'What we collect', 'How, and is it needed?']}
          rows={[
            [
              'Every visit',
              'Your IP address, your browser’s user agent (its name and version) and the address of the page you open.',
              'Your browser sends them with every request, as with any website. Our hosting providers receive them and can keep them in their logs. Needed to deliver the site.',
            ],
            [
              'Page counting',
              'The address of the page you view, with any poster identifier replaced and the query string removed; and, on the first page you open, the address of the website that sent you to Postr, if any. From the request, Vercel may also record an approximate location and your device type, operating system and browser.',
              'A Vercel Web Analytics script on the site sends them. It is not loaded when your browser sends Global Privacy Control. Section 6 explains.',
            ],
            [
              'When you open the editor or send feedback without an account',
              'A guest account: a random identifier, so your work can be saved.',
              'Our sign-in service creates it automatically. Needed to save your work.',
            ],
            [
              'When you create an account',
              'Your email address; your password, if you choose one, which our sign-in service keeps only in a scrambled (hashed) form; if you sign in with Google, the basic profile Google sends (name, email address, picture address); and whether you agreed to research and product-update emails.',
              'You enter them on the sign-up page, or Google sends them when you choose Google. The email choices are optional and off unless you tick them.',
            ],
            [
              'Profile details',
              'Display name, institution, department, ORCID iD and website.',
              'You type them on your Profile page. They stay in your browser, on that device: our servers never receive them. Optional.',
            ],
            [
              'When you make a poster',
              'The poster itself (its text, blocks, styles, authors, institutions and references), the images you upload, a preview image of the poster, the logos you save to your logo library and the versions you save.',
              'You create them in the editor, which saves them to our database and file storage. Needed: this is the product.',
            ],
            [
              'When you import a poster, copy a design, scan an image or paste authors or references',
              'The page images, the image or the pasted text you send.',
              'You start the feature. The app sends the content through our API to a language-model provider, Anthropic, which reads it (Section 7). Only if you use these features.',
            ],
            [
              'When you buy a plan',
              'Your plan, export credits, subscription status, the date of your first paid export, any refunds, and the Stripe customer and subscription identifiers linked to your account.',
              'You pay on Stripe’s own pages, and Stripe tells our API what you bought. Stripe collects your payment details; we never see your card number. Only if you buy a plan.',
            ],
            [
              'When you send feedback',
              'Your message (its title and text), the full address of the page you were on and your browser’s user agent. If an import or a design copy fails and you report it: the file you were using, unless you untick it, and your browser’s console log, only if you tick it.',
              'You submit the feedback form. Only if you send feedback.',
            ],
            [
              'Technical records',
              'One line for each request to our API (the path, the result, how long it took and your account identifier); error reports from the app (the error, where it happened, the poster identifier and the app version); and, when you import an image or a PDF without selectable text, up to 200 characters of the text read from it.',
              'Our API writes them automatically. Needed to find errors and prevent abuse.',
            ],
          ]}
        />
        <Body>
          We do not ask for sensitive information (health, biometric, political,
          religious, sexual orientation, ethnic origin, union membership, genetic
          data). If you type such information into a poster yourself, it is kept as
          the poster you wrote. It goes to the language-model provider only if you
          send that content through one of the features in Section 7.
        </Body>

        <SectionHeading n="3" title="Why we use it" />
        <Table
          headers={['Purpose', 'Information used']}
          rows={[
            ['Running the editor, saving your work and letting you sign in', 'Your account, your posters, technical records'],
            ['Reading the files and text you send through the import, design-copy, image-scan and paste features', 'The content you send'],
            ['Taking payments and managing your plan', 'Your email address, account identifier, plan and billing records'],
            ['Answering your feedback, questions and requests', 'Your feedback, and your email address if you have an account'],
            ['Finding errors, keeping the service secure and preventing abuse', 'Technical records, and the IP address and user agent in our hosting providers’ logs'],
            ['Counting page views, to see which pages are used', 'The page-counting details in Section 6'],
            ['Inviting you to product research, only if you opted in', 'Your email address, and any answers you choose to give'],
            ['Emailing you about new features, only if you opted in', 'Your email address'],
            ['Meeting legal obligations, such as tax and accounting rules', 'What the obligation requires'],
          ]}
        />
        <Body>
          We use your information only for these purposes, for others the law allows,
          or with your consent. We do not sell it, we do not use it for advertising,
          and we do not use your posters to train any AI model. Where we rely on your
          consent (the two optional email lists), you can withdraw it at any time, as
          Section 10 explains, and doing so never affects your access to Postr.
        </Body>

        <SectionHeading n="4" title="Who receives your information" />
        <Body>
          We do not sell or rent your personal information. The service providers
          below receive it to run Postr, each for its own part. The first three run
          Postr itself.
        </Body>
        <Table
          headers={['Provider', 'What it does for Postr', 'What it receives, and when']}
          rows={[
            [
              'Vercel',
              'Hosts the website: it serves every page and the app to your browser, and counts page views (Vercel Web Analytics).',
              'For every page you load: your IP address, user agent and the page address. For page counting: the details in Section 6, unless your browser sends Global Privacy Control.',
            ],
            [
              'Render',
              'Runs our API, the server that handles imports, the paste features, payments, refunds, account deletion and error reports.',
              'For each request the app makes to the API: your IP address, user agent and account identifier, and what that request carries (for example a pasted reference list, an image to read, or an error report).',
            ],
            [
              'Supabase',
              'Our database, sign-in service and file storage. It also sends the emails that confirm an address or let you sign in.',
              'Everything saved with your account: your account and email address, posters, versions, uploaded images, logos, feedback, email choices and plan records. Each time you use the editor or your account.',
            ],
            [
              'Anthropic',
              'A language model that reads the content you send through the features in Section 7 and returns structured results.',
              'Through our API, only when you use one of those features: the page images, the image or the pasted text.',
            ],
            [
              'Stripe',
              'Takes payments and runs subscriptions through its merchant-of-record service, which also calculates and collects tax.',
              'From our API when you start a checkout: your email address and account identifier. On Stripe’s own pages: your payment details. Only if you buy a plan.',
            ],
            [
              'Google',
              'Sign-in with Google, if you choose it; the editor’s fonts (Google Fonts); the university icons shown in the logo picker.',
              'Sign-in: what you agree to share on Google’s pages. Fonts: your IP address and user agent, each time the editor loads a font. Logo picker: your IP address and user agent when it shows its preset icons.',
            ],
            [
              'Wikimedia Foundation',
              'University logos from Wikidata, Wikipedia and Wikimedia Commons.',
              'Your IP address and user agent, when you pick a logo preset.',
            ],
          ]}
        />
        <Body>
          If you use the Staples print helper, your email provider (Gmail, Outlook.com
          or Yahoo Mail) opens a draft addressed to Staples with your poster’s title as
          the subject. Nothing is sent until you send it yourself.
        </Body>
        <Body>
          We do not share your personal information with advertisers, data brokers or
          social networks. If a legal authority issues a valid order that compels us
          to disclose information, we will comply, and we will tell you unless the law
          forbids it.
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

        <SectionHeading n="5" title="Information communicated outside Quebec" />
        <Body>
          Resila is in Quebec, but the providers in Section 4 store and process your
          information outside Quebec and outside Canada, in the United States or other
          countries. We communicate it to them only for the purposes in Section 3,
          under their terms of service. Information held in another country is subject
          to that country’s laws, and its courts or authorities may be able to obtain
          it. Write to the Privacy Officer to ask how a given provider protects your
          information.
        </Body>

        <SectionHeading n="6" title="Page counting, cookies and browser storage" />
        <Body>
          We count page views with Vercel Web Analytics, and with no other analytics
          tool. It sets no cookie and stores nothing in your browser. For each page you
          view it sends Vercel the page address, with any poster identifier replaced by
          a placeholder and the query string removed. On the first page you open, it
          also sends the address of the website that sent you to Postr, if any. Like
          every request, it carries your IP address and user agent, from which an
          approximate location and your device can be worked out. Vercel’s
          documentation says it may record with each page view an approximate
          location (country, region and city), your device type, operating system
          and browser. It also says it tells visits apart with a value it derives
          from the request and discards within 24 hours, and that the page views it
          records are not tied to you or to your IP address.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">How to object.</strong> If your browser
          sends Global Privacy Control (a privacy setting offered by some browsers, such
          as Firefox, Brave and DuckDuckGo), Postr does not load Vercel Web Analytics at
          all, so your page views are not counted. You can also object by writing to
          the Privacy Officer. Page counting keeps no identifier for you, so Global
          Privacy Control, or blocking the script in your browser, is what stops it for
          your browser.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Google Fonts.</strong> The editor loads
          its fonts from Google Fonts, Google’s font service. Each time it does, your
          browser sends Google your IP address and user agent, as with any request.
          Google receives no poster content. The public pages of the site do not load
          Google Fonts.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Browser storage.</strong> Postr sets no
          cookies. It keeps a few items in your browser’s storage: your sign-in session,
          a marker that notices when the same poster is open in two tabs, short-lived
          values for the open tab, and settings and notes you create, such as saved
          styles, palettes, scratch-pad notes, the plotting scripts you put into the
          figure check and your profile details. We use them only to run features you
          use. The{' '}
          <Link to="/cookies" className="text-[#7c6aed] underline">
            Cookies Policy
          </Link>{' '}
          lists each one.
        </Body>

        <SectionHeading n="7" title="Language-model features, profiling and automated decisions" />
        <Body>
          Four features send content to a language model, Anthropic’s Claude, which
          reads it and returns structured results:
        </Body>
        <List
          items={[
            'Importing a poster from a PDF or an image: an image of the page, or parts of it, so the model can find the figures, logos and text.',
            'Copy a design: an image of the poster you choose, so the model can identify its fonts and how its colours are used.',
            '“Scan image” in the editor’s Figure tab: the selected image, so the model can find its text and measure how large it will print.',
            'Pasting a list of authors or references: the pasted text, so the model can split it into names, affiliations and references.',
          ]}
        />
        <Body>
          Nothing is sent until you use one of these features. The results fill in your
          poster in the editor, where you can change or remove them. The plot checker
          for pasted R or Python code runs in your browser and sends your code nowhere.
        </Body>
        <Body>
          Apart from the approximate location Vercel derives from each page view
          (Section 6), Postr uses no technology that identifies, locates or profiles
          you: nothing recognises your face or voice, follows where you are, or builds
          a profile of your interests or behaviour. We use page counting only to see
          how many people view each page, never to locate a particular person. Global
          Privacy Control turns page counting off (Section 6); nothing else of this
          kind exists to turn on or off.
        </Body>
        <Body>
          No decision about you is based only on automated processing, with one small
          exception: the refund button on your Profile page applies the refund rule in
          the{' '}
          <Link to="/terms#refunds" className="text-[#7c6aed] underline">
            Terms of Service
          </Link>{' '}
          to your purchase and export records. If it refuses, you can ask for a refund
          by email instead, and a person will review your request and tell you the
          information and reasons behind the answer.
        </Body>

        <SectionHeading n="8" title="Privacy by default" />
        <Body>These settings start at the most private choice:</Body>
        <List
          items={[
            'The research and product-update emails are off until you tick them.',
            'When you report a failed import or design copy, your browser’s console log is not sent unless you tick it.',
            'Your profile details stay in your browser.',
            'Nothing you make is published: there is no gallery or share link at the moment.',
            'Nothing goes to the language model until you use a feature that needs it.',
          ]}
        />
        <Body>
          Two things do not start at the most private choice. Page counting is on by
          default. It is not loaded when your browser sends Global Privacy Control,
          and Section 6 explains how to object. And when you report a failed import
          or design copy, the box that attaches the file you were importing starts
          ticked, because the report is about it; you can untick it before sending.
        </Body>

        <SectionHeading n="9" title="How long we keep it, and how it is destroyed" />
        <Table
          headers={['Information', 'How long']}
          rows={[
            ['Posters and the versions you save', 'Until you delete the poster or your account.'],
            [
              'Images you upload to a poster, and poster preview images',
              'Until you delete your account. Deleting a poster does not delete these files.',
            ],
            ['Logos in your logo library', 'Until you delete the logo or your account.'],
            [
              'Images sent for import or design copying',
              'Put in temporary storage for the language model to read, and deleted by the app when that step ends. Any that fail to delete stay until you delete your account.',
            ],
            [
              'Guest accounts',
              'A weekly job deletes guest accounts that were never turned into a permanent account, once 14 days have passed since their last sign-in. The job does not delete the files a guest uploaded; no period is set for them.',
            ],
            [
              'Feedback',
              'Kept while Postr runs, so we can follow reports and decisions. When you delete your account, your feedback stays, and the field that links it to your account is cleared. Its text stays as you sent it, with any console log you chose to send. If you attached a file, the file is deleted with your account, but your feedback still says where the file was stored, and that contains your account identifier.',
            ],
            [
              'Record of an account deletion',
              'When you delete your account, we keep your account identifier, your Stripe customer identifier, the identifiers of any subscriptions we cancelled and the number of files we removed, so we can match later payment events. No end date is set.',
            ],
            [
              'API logs and error reports',
              'As long as our hosting providers keep logs. We have not set a shorter period.',
            ],
            [
              'Copies in our providers’ backups and caches',
              'Until those copies expire, on our providers’ own schedules.',
            ],
            ['Payment, tax and accounting records', 'As long as the law requires.'],
            [
              'Items in your browser',
              'As the Cookies Policy lists. Deleting your account clears them in the browser you use to delete it.',
            ],
          ]}
        />
        <Body>
          To destroy information, we delete it from our database and file storage.
          Copies in our providers’ backups and logs disappear when those copies expire.
        </Body>

        <SectionHeading n="10" title="Your rights in Canada and Quebec" />
        <Body>
          Law 25 and PIPEDA give you the rights below. To use one, write to the Privacy
          Officer at{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          from your account’s email address. A guest account has no email address:
          include the account identifier from the file that “Download my data” gives
          you. We may ask you to confirm your identity. We reply in writing within 30
          days of receiving your request, and using your rights is free.
        </Body>
        <Table
          headers={['Right', 'What it means', 'How to use it in Postr today']}
          rows={[
            [
              'Access',
              'Know what personal information we hold about you, how we use it, who has received it and how long we keep it, and get a copy.',
              '“Download my data” on your Profile page gives you a file with your account details, your posters and your feedback. For everything else we hold (versions, logos, images, billing records, email choices), email the Privacy Officer.',
            ],
            [
              'Rectification',
              'Have information that is inaccurate, incomplete or out of date corrected.',
              'Correct your posters in the editor, and your profile details on your Profile page. For your email address or anything else, email the Privacy Officer.',
            ],
            [
              'Withdrawal of consent',
              'Withdraw a consent you gave, at any time. It does not undo what was done before.',
              'Turn off the research or product-update emails on your Profile page, or email the Privacy Officer.',
            ],
            [
              'Deletion',
              'Have your information deleted when it is no longer needed, or was collected or kept against the law.',
              'Delete a poster from your dashboard, a logo from your logo library, or your whole account from your Profile page. Section 9 lists what remains afterwards. You can also email the Privacy Officer.',
            ],
            [
              'De-indexation',
              'Ask us to stop spreading your information, or to de-index a link to your name that gives access to it, when spreading it breaks the law or a court order, or seriously harms your reputation or privacy.',
              'Postr publishes nothing about you at the moment. If you published a poster to the former gallery, retract it on your Profile page. For anything else, email the Privacy Officer.',
            ],
            [
              'Portability',
              'Receive the information you gave us in a structured, commonly used technological format, or have it sent to a person or body that the law authorizes to collect it.',
              '“Download my data” gives you a JSON file of your account details, posters and feedback, and “Save as .postr” in the editor saves a poster with its images. For anything else, or to have it sent elsewhere, email the Privacy Officer.',
            ],
            [
              'Explanation of an automated decision',
              'Be told the information and the reasons behind a decision made only by automated processing, and have a person review it.',
              'The refund button is the only such decision (Section 7). Email the Privacy Officer.',
            ],
            [
              'Complaint',
              'Complain about how we handle your information.',
              'Write to the Privacy Officer, as Section 11 explains. You can also complain to the Commission d’accès à l’information du Québec (CAI) or the Office of the Privacy Commissioner of Canada (OPC).',
            ],
          ]}
        />
        <Body>
          Deleting your account cancels any subscription and deletes your account, your
          posters and your uploaded files. It ends a paid term straight away, without a
          refund for the rest of the period, and removes any unused export credits.
        </Body>

        <SectionHeading n="11" title="How we govern personal information" />
        <Body>
          <strong className="text-[#e2e2e8]">Roles and responsibilities.</strong>{' '}
          Resila Technologies Inc. is responsible for the personal information Postr
          holds, throughout its life cycle: collection, use, communication, retention
          and destruction. Its Privacy Officer approves this policy; decides who may
          access personal information, which is limited to the people who run Postr and
          to what their work requires; checks that a new provider or a new feature that
          uses personal information is described in this policy before it goes live;
          keeps the register of confidentiality incidents; and answers requests and
          complaints.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Collection, use and retention.</strong> We
          collect what Section 2 lists, use it for the purposes in Section 3, share it
          only as Section 4 says, and keep it as Section 9 says. Information is
          destroyed by deleting it, as Section 9 explains, unless the law requires us to
          keep it.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Complaints.</strong> Send your complaint
          to the Privacy Officer at{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . We confirm that we received it, look into it, and reply in writing within
          30 days with what we found and what we will do. If you are not satisfied, you
          can complain to the Commission d’accès à l’information du Québec (CAI) or to
          the Office of the Privacy Commissioner of Canada (OPC).
        </Body>

        <SectionHeading n="12" title="Confidentiality incidents" />
        <Body>
          If personal information is accessed, used or communicated without
          authorization, or lost, we take reasonable steps to reduce the risk of harm
          and to prevent it from happening again, and we record the incident in our
          register. If the incident presents a risk of serious injury, we notify the
          Commission d’accès à l’information du Québec and the people affected
          promptly, and, under PIPEDA, the Office of the Privacy Commissioner of Canada.
        </Body>

        <SectionHeading n="13" title="Security" />
        <Body>
          Every connection to Postr is encrypted (HTTPS). Our database and file storage
          provider encrypts stored data, and every table in our database has access
          rules that decide which account can read or change each row. The database’s
          full-access key
          is kept on our server and never sent to your browser. No system is perfectly
          secure, but we take reasonable steps for the size of the service and the
          sensitivity of the information.
        </Body>

        <SectionHeading n="14" title="Children" />
        <Body>
          Postr is meant for university students and researchers. We do not knowingly
          collect personal information from children under 16. If you believe a child
          has given us personal information, write to the Privacy Officer and we will
          delete it.
        </Body>

        <SectionHeading n="15" title="If you are in the European Union or the United Kingdom" />
        <Body>
          The EU or UK General Data Protection Regulation (GDPR) also applies to you.
          Resila Technologies Inc. is the controller. These are our legal bases:
        </Body>
        <Table
          headers={['Purpose', 'Legal basis']}
          rows={[
            ['Running the editor, saving your work, sign-in', 'Contract (Art. 6(1)(b))'],
            ['Reading the content you send through the features in Section 7', 'Contract, as part of the feature you use (Art. 6(1)(b))'],
            ['Payments and managing your plan', 'Contract (Art. 6(1)(b))'],
            ['Finding errors, security and preventing abuse', 'Legitimate interest (Art. 6(1)(f))'],
            ['Counting page views', 'Legitimate interest (Art. 6(1)(f))'],
            ['Answering feedback and requests', 'Legitimate interest (Art. 6(1)(f))'],
            ['Research invitations and product-update emails', 'Consent (Art. 6(1)(a)), which you can withdraw at any time'],
            ['Legal obligations', 'Legal obligation (Art. 6(1)(c))'],
          ]}
        />
        <Body>
          Besides the rights in Section 10, you can ask us to restrict processing while
          a dispute is settled, and to have the information you gave us sent directly
          to another organization, where technically feasible. You can complain to the
          supervisory authority where you live, work or think the law was broken (in
          the UK, the Information Commissioner’s Office). We reply within one month.
        </Body>
        <Body>
          Your information is transferred to Canada, where Resila is, and to the
          United States or other countries, where our providers process it. The
          European Commission and the United Kingdom recognise Canada as giving
          adequate protection to information held by organizations subject to PIPEDA.
          For the United States, their adequacy decisions cover only companies
          certified under the EU-U.S. Data Privacy Framework (for the UK, its UK
          Extension). Write to the Privacy Officer to learn whether an adequacy
          decision or another safeguard covers a provider, and to get a copy of any
          safeguard.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Right to object (Art. 21 GDPR).</strong>
          <br />
          You can object at any time, on grounds relating to your situation, to
          processing based on our legitimate interest, including page counting. Write
          to the Privacy Officer at{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          , or turn on Global Privacy Control to stop page counting in your browser.
        </CalloutBox>

        <SectionHeading n="16" title="If you are in the United States" />
        <Body>
          We do not sell your personal information, and we do not share it for
          advertising based on your activity across other websites. Postr honours
          Global Privacy Control as Section 6 explains. Depending on the state where you
          live, you may have the right to know what we collect, to get a copy, to have
          it corrected or deleted, and not to be treated differently for using these
          rights. Use them as Section 10 explains.
        </Body>

        <SectionHeading n="17" title="Changes to this policy" />
        <Body>
          We may update this policy as Postr or the law changes. The date at the top
          shows the current version. If a change significantly affects how we use your
          information, we will say so on this page before it takes effect and, where we
          have your email address, tell you by email.
        </Body>

        <SectionHeading n="18" title="Contact" />
        <Body>
          Questions, requests or complaints about your personal information: the Privacy
          Officer, Resila Technologies Inc.,{' '}
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
