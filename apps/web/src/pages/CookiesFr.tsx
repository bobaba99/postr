/**
 * Politique relative aux témoins — version française (français québécois).
 *
 * Miroir de Cookies.tsx. Contenu factuel identique ; seul le texte
 * destiné à l'utilisateur est traduit. Les classes, hrefs, ancres,
 * liens mailto et cibles de route restent identiques à la version
 * anglaise.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

const LAST_UPDATED = '27 juillet 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function CookiesFr() {
  useDocumentMeta(STATIC_ROUTE_META['/cookies/fr'] ?? null);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
            Légal
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
          <Link to="/privacy" className="text-[#7c6aed] underline">
            Politique de confidentialité
          </Link>
          .
        </Body>

        <SectionHeading n="2" title="Ce que sont les témoins (et les technologies similaires)" />
        <Body>
          Un <em>témoin</em> est un petit fichier texte qu'un site Web demande à
          votre navigateur de conserver afin de pouvoir vous reconnaître lors d'un
          chargement de page ultérieur. Les applications Web modernes utilisent
          aussi des fonctions de navigateur connexes — <em>localStorage</em> et{' '}
          <em>sessionStorage</em> — qui remplissent le même rôle (mémoriser un
          état d'une visite à l'autre) mais résident dans une partie différente du
          navigateur. Partout où la présente politique dit « témoins », nous
          entendons collectivement les témoins, le localStorage et le
          sessionStorage.
        </Body>
        <Body>
          Les autorités de réglementation (CAI, CNIL, ICO, CPVP) traitent ces
          technologies de la même manière :
          <strong> le stockage strictement nécessaire</strong> peut être utilisé
          sans demander la permission, mais tout ce qui est facultatif — analytique,
          publicité, contenus intégrés de tiers — exige votre{' '}
          <strong>consentement préalable, éclairé et donné librement</strong>.
        </Body>

        <SectionHeading n="3" title="Ce que Postr utilise aujourd'hui" />
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Postr n'utilise que du stockage strictement nécessaire.</strong>
          <br />
          Nous n'exécutons pas Google Analytics, le pixel Facebook, de traceurs
          publicitaires, de boutons de partage de médias sociaux avec suivi, ni
          aucune autre technologie qui stocke quoi que ce soit sur votre appareil.
          Nous comptons bien les pages vues, au moyen de Vercel Web Analytics — cet
          outil ne dépose aucun témoin, n'écrit rien dans votre navigateur et ne
          peut pas vous reconnaître lors d'une deuxième visite ni sur aucun autre
          site. Aucune bannière de consentement n'est affichée parce qu'aucune des
          entrées ci-dessous n'exige de consentement en vertu du RGPD, de la
          directive vie privée et communications électroniques, de la LPRPDE ou de
          la Loi 25 du Québec — cette obligation s'applique au stockage ou à la
          lecture de données sur votre appareil, et le comptage des pages ne fait
          ni l'un ni l'autre.
        </CalloutBox>

        <Table
          headers={['Entrée', 'Stockée où', 'Ce qu’elle fait', 'Durée de vie']}
          rows={[
            [
              'sb-<project-ref>-auth-token',
              'localStorage',
              'Conserve votre session d’authentification Supabase (JWT + jeton de rafraîchissement). Sans elle, l’application ne peut pas savoir qui vous êtes et vos brouillons ne peuvent pas être chargés.',
              'Jusqu’à votre déconnexion ou l’expiration de la session',
            ],
            [
              'postr-onboarding-*',
              'localStorage',
              'Retient si vous avez vu la visite guidée d’accueil afin que nous ne l’affichions pas à chaque visite.',
              'Jusqu’à ce que vous effaciez les données du navigateur',
            ],
            [
              'postr-templates',
              'localStorage',
              'Conserve les modèles d’affiche personnalisés que vous enregistrez depuis le bloc-notes de l’éditeur afin qu’ils soient disponibles lors de votre prochaine visite.',
              'Jusqu’à ce que vous supprimiez le modèle ou effaciez les données du navigateur',
            ],
            [
              'Minuteries de rafraîchissement/session Supabase',
              'sessionStorage',
              'Indicateurs techniques de courte durée utilisés par le client Supabase pour coordonner le rafraîchissement des jetons entre les onglets.',
              'Jusqu’à ce que vous fermiez l’onglet du navigateur',
            ],
          ]}
        />
        <Body>
          Toutes ces entrées relèvent de l'exemption « strictement nécessaire à la
          fourniture du service expressément demandé par l'utilisateur » prévue à
          l'article 5(3) de la directive vie privée et communications électroniques
          et aux dispositions équivalentes de la LPRPDE et de la Loi 25 du Québec.
          Aucune d'elles ne vous suit à travers d'autres sites.
        </Body>

        <SectionHeading n="4" title="Le comptage des pages, et ce que Postr n'utilise toujours pas" />
        <Body>
          Postr compte les pages vues avec{' '}
          <strong className="text-[#e2e2e8]">Vercel Web Analytics</strong>, afin
          que nous puissions voir quelles pages les gens trouvent utiles. Il vaut
          la peine d'être précis sur ce que cela implique et n'implique pas. Cet
          outil ne dépose{' '}
          <strong>aucun témoin</strong> et n'écrit rien dans votre navigateur. Il
          n'existe aucun identifiant qui persiste : une visite est comptée à l'aide
          d'une valeur dérivée de la requête elle-même et supprimée en moins de
          24 heures, de sorte qu'une deuxième visite demain est celle d'un inconnu.
          Chaque chiffre est un agrégat — un décompte des consultations d'une page,
          jamais un enregistrement de ce que vous avez fait.
        </Body>
        <Body>
          Nous retirons également l'adresse avant qu'elle ne soit comptée. Les URL
          d'affiches, les liens de partage et les pages d'administration ne sont
          enregistrés que sous leur forme —{' '}
          <code className="text-[#c8b6ff]">/s/[caviardé]</code> plutôt que
          l'identifiant qui vous a été envoyé. Un lien de partage est un lien vers
          un travail non publié, et l'identifiant est ce qui l'ouvre, si bien qu'il
          ne quitte jamais l'application. Les chaînes de requête sont entièrement
          écartées.
        </Body>
        <List
          items={[
            'Témoins publicitaires — il n’y a aucune publicité sur Postr.',
            'Google Analytics, Matomo, PostHog, Plausible — aucun de ceux-là.',
            'Suivi intersite ou empreinte numérique — nous ne vous profilons pas d’une visite à l’autre ni à travers d’autres sites Web.',
            'Widgets de médias sociaux — aucun bouton Facebook, Twitter ou LinkedIn qui transmet des données.',
            'Identifiants persistants au-delà de ce qu’exige votre session d’authentification.',
            'Enregistrement du contenu de vos affiches, des identifiants de liens de partage ou des chaînes de requête dans l’analytique.',
          ]}
        />
        <Body>
          Si nous ajoutons un jour quelque chose qui <em>stocke</em> ou lit
          effectivement des données sur votre appareil à des fins facultatives,
          nous mettrons à jour la présente politique, afficherons une bannière de
          consentement offrant des choix « Accepter » et « Refuser » d'égale
          visibilité, et nous abstiendrons de déposer tout stockage non essentiel
          jusqu'à ce que vous cliquiez sur « Accepter ».
        </Body>

        <SectionHeading n="5" title="Comment contrôler les témoins" />
        <Body>
          Comme Postr ne stocke actuellement que ce qui est strictement nécessaire
          à la connexion et à l'édition, la suppression de ces entrées vous
          déconnectera et effacera vos modèles enregistrés localement ainsi que
          votre état d'accueil. Vos données côté serveur (affiches, profil,
          rétroaction) ne sont pas touchées.
        </Body>
        <Body>
          Vous pouvez effacer le stockage de Postr des façons habituelles pour
          votre navigateur :
        </Body>
        <List
          items={[
            'Chrome / Edge : Paramètres → Confidentialité et sécurité → Cookies et autres données de site → Afficher toutes les données et autorisations des sites → rechercher « postr.sh » → Supprimer.',
            'Firefox : Paramètres → Vie privée et sécurité → Cookies et données de sites → Gérer les données → rechercher « postr.sh » → Supprimer.',
            'Safari : Réglages → Confidentialité → Gérer les données de site Web → rechercher « postr.sh » → Supprimer.',
            'Mobile : suivez les instructions de votre navigateur pour effacer les données de site.',
          ]}
        />
        <Body>
          La plupart des navigateurs vous permettent aussi de bloquer tous les
          témoins, de bloquer les témoins de tiers ou de recevoir une invite avant
          le dépôt de chaque témoin. Bloquer les témoins strictement nécessaires
          empêchera Postr de fonctionner.
        </Body>

        <SectionHeading n="6" title="Do Not Track et Global Privacy Control" />
        <Body>
          Nous respectons les en-têtes « Do Not Track » (DNT) et le signal plus
          récent{' '}
          <em>Global Privacy Control</em> (GPC). À ce jour, ces signaux n'ont rien
          à désactiver, puisque nous n'exécutons ni analytique ni publicité ciblée.
          Si nous introduisons un jour un suivi facultatif, la réception d'un signal
          DNT ou GPC de votre navigateur sera traitée comme un retrait automatique
          du consentement.
        </Body>

        <SectionHeading n="7" title="Conservation" />
        <Body>
          Chaque entrée du tableau ci-dessus subsiste jusqu'à la durée de vie qui y
          est indiquée. Aucune d'elles ne dépasse 13 mois, qui est la période de
          conservation maximale autorisée pour les registres de consentement selon
          les lignes directrices de la CNIL française et une référence courante
          parmi les autorités de réglementation de l'UE. Lorsque nous ajouterons un
          témoin de consentement à l'avenir, nous le fixerons par défaut à{' '}
          <strong>6 mois</strong>, conformément à la recommandation de la CNIL.
        </Body>

        <SectionHeading n="8" title="Modifications de la présente politique" />
        <Body>
          Nous pouvons mettre à jour la présente Politique relative aux témoins à
          mesure que le produit évolue. La date de « Dernière mise à jour » en haut
          reflète la version courante. Si une modification est importante — par
          exemple, la première fois que nous introduirons un témoin d'analytique ou
          de publicité — nous afficherons un avis clair dans l'application avant que
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
