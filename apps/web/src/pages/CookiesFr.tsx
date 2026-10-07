/**
 * Politique relative aux témoins — version française (français québécois).
 *
 * Miroir de Cookies.tsx. Contenu factuel identique ; seul le texte
 * destiné à l'utilisateur est traduit. Les classes, hrefs, ancres,
 * liens mailto et cibles de route restent identiques à la version
 * anglaise. Global Privacy Control, Google Fonts and the deletion
 * lifetimes follow Cookies.tsx (record 24); see that file's header.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

const LAST_UPDATED = '6 octobre 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function CookiesFr() {
  useDocumentMeta(STATIC_ROUTE_META['/cookies/fr'] ?? null);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
            Juridique
          </div>
          <Link to="/cookies" className="text-[#7c6aed] underline text-sm">
            English
          </Link>
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">
          Politique relative aux témoins
        </h1>
        <p className="mt-4 text-sm text-[#8b8f99]">Dernière mise à jour : {LAST_UPDATED}</p>

        <SectionHeading n="1" title="Portée" />
        <Body>
          La présente Politique relative aux témoins explique comment{' '}
          <strong>Resila Technologies Inc.</strong>{' '}
          (la société derrière Postr) utilise les témoins et les technologies de
          stockage côté client similaires sur{' '}
          <a className="text-[#7c6aed] underline" href="https://postr.sh">postr.sh</a>. Elle
          complète notre{' '}
          <Link to="/privacy/fr" className="text-[#7c6aed] underline">
            Politique de confidentialité
          </Link>
          .
        </Body>

        <SectionHeading n="2" title="Ce que sont les témoins (et les technologies similaires)" />
        <Body>
          Un <em>témoin</em> est un petit fichier texte qu’un site Web demande à
          votre navigateur de conserver afin de pouvoir vous reconnaître lors d’un
          chargement de page ultérieur. Les applications Web modernes utilisent
          aussi deux fonctions de navigateur connexes, le <em>localStorage</em> et
          le <em>sessionStorage</em>, qui jouent un rôle semblable (mémoriser un
          état d’un chargement de page à l’autre) mais résident dans une partie
          différente du navigateur. Partout où la présente politique dit
          « témoins », nous entendons collectivement les témoins, le localStorage
          et le sessionStorage.
        </Body>
        <Body>
          Les autorités de protection de la vie privée (CAI, CNIL, ICO, CPVP)
          traitent ces technologies de la même manière que les témoins. Le
          stockage <strong>strictement nécessaire</strong> peut être utilisé sans
          demander la permission. Le stockage facultatif, par exemple pour la
          publicité ou les contenus intégrés de tiers, exige généralement votre{' '}
          <strong>consentement préalable, éclairé et donné librement</strong>, et
          les règles sur la mesure d’audience varient d’une autorité à l’autre.
        </Body>

        <SectionHeading n="3" title="Ce que Postr utilise aujourd’hui" />
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Tout ce que Postr stocke sur votre appareil figure dans le tableau
            ci-dessous.
          </strong>
          <br />
          Chaque entrée sert au fonctionnement d’une fonctionnalité de Postr ou
          conserve quelque chose que vous avez enregistré, et aucune ne sert à la
          publicité ni à vous suivre d’un site à l’autre. Nous n’exécutons pas
          Google Analytics, le pixel Facebook, de traceurs publicitaires ni de
          boutons de partage de médias sociaux. Nous comptons bien les pages vues
          au moyen de Vercel Web Analytics, et nous n’utilisons rien d’autre. Tel
          que Postr l’utilise, il ne dépose aucun témoin et n’écrit rien dans votre
          navigateur, et Postr ne le charge pas lorsque votre navigateur envoie le
          signal Global Privacy Control. La section 4 explique son
          fonctionnement.
        </CalloutBox>

        <Table
          headers={['Entrée', 'Stockée où', 'Ce qu’elle fait', 'Durée de vie']}
          rows={[
            [
              'sb-<project-ref>-auth-token',
              'localStorage',
              'Conserve votre session de connexion : les jetons qui prouvent votre identité et une copie de votre fiche de compte. Sans elle, Postr ne peut pas savoir qui vous êtes ni charger vos affiches.',
              'Jusqu’à la suppression de votre compte, la fin de la session ou l’effacement des données du navigateur',
            ],
            [
              'postr.style-presets, postr.custom-palettes, postr.checklist-templates, postr.scratch-pad, postr.scratch-note',
              'localStorage',
              'Les préréglages de style, palettes de couleurs, modèles de liste de vérification et notes du bloc-notes (Scratch Pad) que vous enregistrez dans l’éditeur, afin qu’ils soient là à votre prochaine visite. L’entrée des préréglages de style est créée vide la première fois que vous ouvrez l’éditeur.',
              'Jusqu’à ce que vous les supprimiez, supprimiez votre compte dans ce navigateur ou effaciez les données du navigateur.',
            ],
            [
              'postr.profile',
              'localStorage',
              'Les données de profil que vous saisissez sur votre page Profil : nom, établissement, département, ORCID et site Web. Elles sont conservées uniquement dans ce navigateur et ne sont pas envoyées à nos serveurs.',
              'Jusqu’à la suppression de votre compte ou l’effacement des données du navigateur',
            ],
            [
              'postr.onboarding-done, postr.cb-random-pref',
              'localStorage',
              'Retiennent que vous avez terminé ou passé la visite guidée de l’éditeur, et si les palettes aléatoires doivent être adaptées au daltonisme.',
              'Jusqu’à ce que vous supprimiez votre compte dans ce navigateur ou effaciez les données du navigateur. Le bouton Replay tour de votre page Profil efface aussi l’entrée de la visite guidée.',
            ],
            [
              'postr.welcome-seeded:<ID du compte>',
              'localStorage',
              'Indique que votre affiche de bienvenue a été créée, afin qu’elle ne soit pas créée de nouveau. Le nom de la clé contient l’identifiant de votre compte.',
              'Jusqu’à ce que vous supprimiez ce compte dans ce navigateur ou effaciez les données du navigateur',
            ],
            [
              'postr.active-editor.<ID de l’affiche>',
              'localStorage',
              'Permet à Postr de vous avertir quand la même affiche est ouverte dans deux onglets. Le nom de la clé contient l’identifiant de l’affiche, ou « new » lorsque l’éditeur s’ouvre à l’adresse /p/new. L’entrée contient un identifiant d’onglet aléatoire et le moment où l’affiche a été ouverte pour la dernière fois.',
              'Jusqu’à ce que vous supprimiez votre compte dans ce navigateur ou effaciez les données du navigateur',
            ],
            [
              'postr.figure-script.<ID de l’affiche>',
              'localStorage',
              'Le script de graphique que vous placez dans la vérification de figure d’une affiche, son langage, ainsi que le script, la taille et le bloc image de votre dernière vérification, pour les retrouver quand vous revenez à cette affiche. Le nom de la clé contient l’identifiant de l’affiche. Ils sont conservés uniquement dans ce navigateur et ne sont pas envoyés à nos serveurs.',
              'Jusqu’à ce que vous vidiez la zone de code, supprimiez l’affiche ou votre compte dans ce navigateur, ou effaciez les données du navigateur. Seules les 10 affiches modifiées le plus récemment gardent un script. Un script très long n’est pas enregistré : il est perdu quand vous rechargez la page ou fermez l’onglet.',
            ],
            [
              'postr.tab-id',
              'sessionStorage',
              'Un identifiant aléatoire pour cet onglet, utilisé par l’alerte des deux onglets.',
              'Jusqu’à ce que vous fermiez l’onglet',
            ],
            [
              'postr.figure-script-page, postr.figure-size-page',
              'sessionStorage',
              'Sur la page de vérification de graphiques, le script que vous y placez, son langage, votre dernière vérification et la taille d’impression que vous avez saisie, pour que le rechargement de la page les conserve.',
              'Jusqu’à ce que vous fermiez l’onglet. Un script très long n’est pas enregistré : il est perdu quand vous rechargez la page.',
            ],
            [
              'postr.signupConsent, postr.checkoutIntent',
              'sessionStorage',
              'Conservent vos choix concernant les courriels de recherche et de marketing, ainsi que le forfait choisi, pendant l’inscription, y compris lors d’une connexion avec Google.',
              'Jusqu’à leur utilisation ou à la fermeture de l’onglet',
            ],
            [
              'postr.autoArrangeOnLoad',
              'sessionStorage',
              'Indique à l’éditeur de mettre en ordre la mise en page d’une affiche que vous venez d’importer. Contient l’identifiant de cette affiche.',
              'Jusqu’à ce que l’éditeur la lise ou que vous fermiez l’onglet',
            ],
            [
              'postr-just-refreshed, postr-acknowledged-build, postr.mobile-notice-dismissed',
              'sessionStorage',
              'Retiennent votre réponse à l’avis d’une nouvelle version de Postr, et que vous avez fermé l’avis affiché sur les écrans de la taille d’un téléphone, afin qu’aucun des deux ne revienne dans cet onglet.',
              'Au plus tard jusqu’à ce que vous fermiez l’onglet',
            ],
          ]}
        />
        <Body>
          La bibliothèque de connexion écrit aussi une entrée de test nommée
          lswt-… et la supprime aussitôt, pour vérifier que votre navigateur
          permet le stockage. Elle n’est pas conservée.
        </Body>
        <Body>
          Nous traitons toutes ces entrées comme relevant de l’exemption
          « strictement nécessaire à la fourniture du service expressément demandé
          par l’utilisateur » prévue à l’article 5(3) de la directive vie privée
          et communications électroniques et aux dispositions équivalentes de la
          LPRPDE et de la Loi 25 du Québec. C’est pourquoi Postr n’affiche aucune
          bannière de consentement. Aucune d’elles ne vous suit à travers d’autres
          sites, et Postr lui-même ne dépose aucun témoin.
        </Body>
        <Body>
          Certaines fonctions chargent des fichiers directement depuis d’autres
          services, qui ont leurs propres politiques relatives aux témoins.
          L’éditeur charge les polices des affiches depuis Google Fonts : chaque
          fois, votre navigateur transmet à Google votre adresse IP et votre agent
          utilisateur, comme pour toute requête. Les pages publiques ne chargent
          pas Google Fonts. Le
          sélecteur de logo s’ouvre sur son onglet Presets, qui charge des icônes
          d’universités depuis Google, et un logo que vous y choisissez est chargé
          depuis des sites Wikimedia ou, à défaut, depuis Google. La connexion
          avec Google ouvre les pages de connexion de Google, qui ont leur propre
          politique relative aux témoins. Les paiements et la facturation
          s’ouvrent sur les pages de Stripe.
        </Body>

        <SectionHeading n="4" title="Le comptage des pages, et ce que Postr n’utilise toujours pas" />
        <Body>
          Postr compte les pages vues avec{' '}
          <strong className="text-[#e2e2e8]">Vercel Web Analytics</strong>, afin
          que nous puissions voir quelles pages les gens trouvent utiles. Il vaut
          la peine d’être précis sur ce que cela implique et n’implique pas. Tel
          que Postr l’utilise, cet outil ne dépose{' '}
          <strong>aucun témoin</strong> et n’écrit rien dans votre navigateur.
          Chaque page vue envoie à Vercel l’adresse de la page, ainsi que ce que
          transmet toute requête Web, comme votre adresse IP et le type de
          navigateur. Sur la première page que vous ouvrez, il envoie aussi
          l’adresse du site Web qui vous a envoyé vers Postr, s’il y en a un; il
          n’envoie jamais une page de Postr comme cette adresse. Selon la
          documentation de Vercel, celui-ci peut enregistrer avec chaque page vue
          une localisation approximative (pays, région et ville), ainsi que le
          type d’appareil, le système d’exploitation et le navigateur. Elle indique aussi que l’outil distingue les visites au
          moyen d’une valeur dérivée de la requête et supprime cette valeur en
          moins de 24 heures.
        </Body>
        <Body>
          Dans l’adresse de page qu’il transmet, Postr remplace les pages
          d’affiches et d’administration par leur forme, par exemple{' '}
          <code className="text-[#c8b6ff]">/p/[redacted]</code> au lieu de
          l’identifiant de votre affiche, et écarte entièrement les chaînes de
          requête. Les pages de Postr indiquent aussi à votre navigateur de
          n’envoyer que l’adresse du site (https://www.postr.sh/), et non le
          chemin de la page, avec la requête de comptage.
        </Body>
        <List
          items={[
            'Témoins publicitaires : il n’y a aucune publicité sur Postr.',
            'Google Analytics, Matomo, PostHog ou Plausible : aucun de ceux-là.',
            'Suivi intersite ou empreinte numérique : nous n’établissons pas votre profil d’une visite à l’autre ni à travers d’autres sites Web.',
            'Modules de médias sociaux : aucun bouton Facebook, Twitter ou LinkedIn qui transmet des données.',
            'Identifiants publicitaires ou de suivi : les seuls identifiants que Postr stocke sur votre appareil sont ceux du tableau ci-dessus, chacun utilisé par la fonction décrite à côté.',
            'Enregistrement du contenu de vos affiches dans la mesure d’audience, ou des identifiants d’affiches et des chaînes de requête dans l’adresse de page que Postr transmet.',
          ]}
        />
        <Body>
          Si nous ajoutons un jour quelque chose qui <em>stocke</em> ou lit
          effectivement des données sur votre appareil à des fins facultatives,
          nous mettrons à jour la présente politique, afficherons une bannière de
          consentement offrant des choix « Accepter » et « Refuser » d’égale
          visibilité, et nous abstiendrons de déposer tout stockage non essentiel
          jusqu’à ce que vous cliquiez sur « Accepter ».
        </Body>

        <SectionHeading n="5" title="Comment contrôler les témoins" />
        <Body>
          La suppression de ces entrées vous déconnecte. Elle efface aussi les
          préréglages, palettes, modèles, notes du bloc-notes, scripts de
          graphique et données de profil qui ne sont conservés que dans votre
          navigateur. Les affiches, la rétroaction et les paramètres enregistrés
          avec votre compte restent sur nos serveurs, et vos affiches et
          paramètres reviennent quand vous vous reconnectez. Si vous utilisez
          Postr en tant qu’invité, sans compte, la session de connexion est la
          seule clé de vos affiches : une fois qu’elle est supprimée, vous ne
          pouvez plus les ouvrir.
        </Body>
        <Body>
          Vous pouvez effacer le stockage de Postr des façons habituelles pour
          votre navigateur :
        </Body>
        <List
          items={[
            'Chrome : Paramètres → Confidentialité et sécurité → Cookies tiers → Voir toutes les données et autorisations des sites → rechercher « postr.sh » → Supprimer.',
            'Edge : ouvrez Paramètres, recherchez « cookies » (ou « témoins »), ouvrez la liste de tous les cookies et données de site, puis recherchez « postr.sh » et supprimez-les.',
            'Firefox : Paramètres → Vie privée et sécurité, puis le bouton qui efface les données de certains sites → rechercher « postr.sh » → supprimer la sélection et enregistrer les modifications.',
            'Safari : Réglages → Confidentialité → Gérer les données des sites Web → rechercher « postr.sh » → Supprimer.',
            'Mobile : suivez les instructions de votre navigateur pour effacer les données de site.',
          ]}
        />
        <Body>
          La plupart des navigateurs vous permettent aussi de bloquer les témoins
          et autres données de site, pour tous les sites ou seulement pour les
          tiers. Si vous bloquez le stockage pour postr.sh, Postr ne peut pas
          garder votre session ouverte d’un chargement de page à l’autre, et
          l’éditeur pourrait ne pas fonctionner.
        </Body>

        <SectionHeading n="6" title="Global Privacy Control et Do Not Track" />
        <Body>
          Postr respecte le signal <em>Global Privacy Control</em> (GPC), un
          réglage de confidentialité offert par certains navigateurs, comme
          Firefox, Brave et DuckDuckGo. Lorsque votre navigateur l’envoie, Postr
          ne charge pas Vercel Web Analytics : vos pages vues ne sont pas
          comptées. Le comptage des pages est la seule chose facultative que le
          GPC pourrait désactiver : Postr n’exécute aucune publicité ni aucun
          suivi intersite. Postr ne lit pas l’ancien en-tête « Do Not Track »
          (DNT); activez plutôt le GPC. Vous pouvez aussi vous opposer au
          comptage des pages en écrivant à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </Body>

        <SectionHeading n="7" title="Conservation" />
        <Body>
          Chaque entrée du tableau ci-dessus subsiste pendant la durée de vie qui
          y est indiquée. Postr ne fixe aucune date d’expiration à ses entrées
          localStorage : chacune reste jusqu’à ce que l’événement indiqué dans le
          tableau se produise, peu importe le temps que cela prend. Les entrées
          sessionStorage prennent fin au plus tard à la fermeture de l’onglet. Si
          nous ajoutons un jour un témoin de consentement, il expirera après{' '}
          <strong>6 mois</strong>, conformément à la recommandation de la CNIL.
        </Body>

        <SectionHeading n="8" title="Modifications de la présente politique" />
        <Body>
          Nous pouvons mettre à jour la présente Politique relative aux témoins à
          mesure que le produit évolue. La date de « Dernière mise à jour » en haut
          reflète la version courante. Si une modification est importante, par
          exemple la première fois que nous introduirons un témoin de mesure d’audience ou
          de publicité, nous afficherons un avis clair dans l’application avant que
          la modification prenne effet.
        </Body>

        <SectionHeading n="9" title="Contact" />
        <Body>
          Questions sur les témoins ou sur la présente politique :{' '}
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
