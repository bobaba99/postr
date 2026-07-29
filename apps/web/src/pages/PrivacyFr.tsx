/**
 * Politique de confidentialité — version publique, inspirée du RGPD, en langage clair.
 *
 * Ce document est un point de départ rédigé à partir des mentions standard
 * des articles 13/14 du RGPD, adapté au droit canadien de la protection des
 * renseignements personnels (LPRPDE + Loi 25 du Québec).
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

const LAST_UPDATED = '10 avril 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function PrivacyFr() {
  useDocumentMeta(STATIC_ROUTE_META['/privacy'] ?? null);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
            Légal
          </div>
          <Link to="/privacy" className="text-[#7c6aed] underline text-sm">
            English
          </Link>
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">
          Politique de confidentialité
        </h1>
        <p className="mt-4 text-sm text-[#6b7280]">Dernière mise à jour : {LAST_UPDATED}</p>

        <SectionHeading n="1" title="Qui nous sommes" />
        <Body>
          Postr (« nous ») est un éditeur d’affiches scientifiques exploité par{' '}
          <strong className="text-[#e2e2e8]">Resila Technologies Inc.</strong>, une
          société constituée dans la province de Québec, au Canada. Si vous avez une
          question sur la façon dont nous traitons vos renseignements personnels — ou
          si vous souhaitez exercer l’un des droits décrits à la section 7 —
          communiquez avec nous à l’adresse{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </Body>
        <Body>
          Nous agissons à titre de <em>responsable du traitement</em> (l’« entreprise »
          au sens du droit québécois). En vertu de la Loi sur la protection des
          renseignements personnels dans le secteur privé du Québec (la réforme dite
          « Loi 25 »), la personne responsable de la protection des renseignements
          personnels au sein de Resila Technologies Inc. est joignable à la même
          adresse que ci-dessus. Nous désignerons un responsable de la protection des
          données dédié si et lorsque les seuils légaux l’exigeront.
        </Body>

        <SectionHeading n="2" title="Quelles données nous recueillons" />
        <Body>
          Nous nous efforçons de recueillir le moins de données possible. Voici la
          liste complète, regroupée selon ce qui se produit lorsque vous interagissez
          avec Postr :
        </Body>
        <Table
          headers={['Quand', 'Quoi', 'Obligatoire ?']}
          rows={[
            [
              'Première visite anonyme',
              'Un identifiant de compte anonyme, l’adresse IP (pour la prévention des abus) et l’agent utilisateur du navigateur.',
              'Oui — nécessaire au fonctionnement de l’application.',
            ],
            [
              'Lors de votre inscription',
              'Votre adresse courriel et, si vous vous connectez avec Google, le profil de base transmis par Google (nom, courriel, URL de l’avatar).',
              'Oui, si vous choisissez de créer un compte permanent.',
            ],
            [
              'Détails du profil (facultatif)',
              'Nom d’affichage, établissement, département, identifiant ORCID, site Web personnel.',
              'Non — tous facultatifs, pour préremplir les informations sur les auteurs de l’affiche.',
            ],
            [
              'Lorsque vous modifiez une affiche',
              'Le document de l’affiche lui-même : blocs, styles, auteurs, établissements, références et toute image que vous téléversez.',
              'Oui — c’est le produit.',
            ],
            [
              'Lorsque vous utilisez la fonction de lisibilité des figures',
              'Le code de traçage R ou Python que vous collez, transmis à un fournisseur de modèle de langage aux fins d’analyse.',
              'Uniquement si vous choisissez d’utiliser la fonction.',
            ],
            [
              'Lorsque vous envoyez des commentaires',
              'Le titre et le corps de votre message, la page où vous vous trouviez et l’agent utilisateur de votre navigateur.',
              'Uniquement si vous soumettez des commentaires.',
            ],
            [
              'Journaux techniques',
              'Rapports d’erreurs côté serveur et côté client, durée approximative des requêtes et chemins des requêtes.',
              'Oui — pour le débogage et la prévention des abus.',
            ],
          ]}
        />
        <Body>
          Nous ne recueillons <strong>pas</strong> intentionnellement de données de
          catégorie particulière (santé, données biométriques, opinions politiques,
          convictions religieuses, orientation sexuelle, origine ethnique, appartenance
          syndicale, données génétiques). Si vous saisissez vous-même de tels
          renseignements dans un bloc d’affiche, ils sont conservés comme le contenu
          d’affiche que vous avez rédigé — nous ne les traitons pas davantage.
        </Body>

        <SectionHeading n="3" title="Pourquoi nous traitons vos données (et notre base juridique)" />
        <Table
          headers={['Finalité', 'Base juridique', 'Catégories de données']}
          rows={[
            [
              'Faire fonctionner l’éditeur, enregistrer vos brouillons, permettre la connexion',
              'Contrat (art. 6(1)(b) RGPD)',
              'Compte, contenu des affiches, journaux techniques',
            ],
            [
              'Déboguer les erreurs et prévenir les abus',
              'Intérêt légitime (art. 6(1)(f) RGPD)',
              'Journaux techniques, adresse IP, agent utilisateur',
            ],
            [
              'Analyse de lisibilité des figures au moyen d’un modèle de langage tiers',
              'Contrat — la fonction que vous avez sollicitée (art. 6(1)(b))',
              'Code de traçage que vous collez',
            ],
            [
              'Répondre aux messages de soutien et de commentaires',
              'Intérêt légitime (art. 6(1)(f))',
              'Contenu des commentaires, coordonnées si vous êtes connecté',
            ],
            [
              'Vous inviter à participer à des recherches sur le produit (entrevues, sondages) — uniquement si vous y consentez',
              'Consentement (art. 6(1)(a)) — révocable à tout moment',
              'Adresse courriel et toute réponse de recherche que vous choisissez de fournir',
            ],
            [
              'Respecter les obligations légales',
              'Obligation légale (art. 6(1)(c))',
              'Les données requises par l’obligation particulière',
            ],
          ]}
        />
        <Body>
          Nous ne vendons pas de renseignements personnels, nous ne réalisons pas de
          profilage ni de prise de décision automatisée produisant des effets
          juridiques ou des effets significatifs semblables, et nous n’utilisons pas le
          contenu de vos affiches pour entraîner un quelconque modèle d’IA. Nous ne vous
          écrivons au sujet de recherches sur le produit que si vous y avez expressément
          consenti, et vous pouvez retirer ce consentement à tout moment dans les
          paramètres de votre compte — cela n’a jamais d’incidence sur votre accès à
          Postr.
        </Body>

        <SectionHeading n="4" title="Qui reçoit vos données" />
        <Body>
          Nous faisons appel à un petit ensemble de fournisseurs de services
          soigneusement choisis (« sous-traitants ») pour faire fonctionner Postr. Ils ne
          traitent vos données que selon nos instructions et pour les finalités
          énumérées.
        </Body>
        <Table
          headers={['Fournisseur', 'Rôle', 'Emplacement']}
          rows={[
            ['Supabase', 'Base de données, authentification, stockage de fichiers', 'Union européenne (région du projet à confirmer)'],
            ['Vercel', 'Hébergement de l’application Web et diffusion en périphérie', 'Mondial (principalement aux États-Unis)'],
            ['Render', 'Hébergement de l’API dorsale', 'États-Unis'],
            ['Anthropic', 'Modèle de langage utilisé pour la fonction de lisibilité des figures', 'États-Unis'],
            ['Google (si vous utilisez la connexion Google)', 'Fournisseur d’identité pour la connexion', 'Mondial'],
          ]}
        />
        <Body>
          Nous ne communiquons pas vos renseignements personnels à des annonceurs, à des
          courtiers en données ou à des réseaux sociaux. Si une autorité légale émet une
          demande valide contraignant la divulgation, nous nous y conformerons et vous en
          informerons, à moins que la loi ne nous l’interdise.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Galerie publique.</strong>
          <br />
          Si vous choisissez de publier une affiche dans la galerie publique ou de créer
          un lien de partage en lecture seule, le contenu de l’affiche et tout nom que
          vous y inscrivez deviennent visibles par quiconque sur Internet — y compris les
          visiteurs qui n’ont pas de compte Postr. L’affiche peut être indexée par les
          moteurs de recherche et mise en cache par des tiers. Le retrait de l’affiche la
          supprime de Postr, mais ne peut rappeler les copies que d’autres pourraient déjà
          avoir faites. Réfléchissez avant de publier. Voir la section 5.3 des{' '}
          <Link to="/terms" className="text-[#7c6aed] underline">
            Conditions d’utilisation
          </Link>{' '}
          pour les règles complètes.
        </CalloutBox>

        <SectionHeading n="5" title="Transferts internationaux" />
        <Body>
          Certains des sous-traitants ci-dessus sont établis aux États-Unis. Lorsque vos
          données sont transférées à l’extérieur de l’Espace économique européen, nous
          nous appuyons sur des garanties appropriées : les clauses contractuelles types
          approuvées par la Commission européenne et, le cas échéant, la certification du
          destinataire au titre du cadre de protection des données UE–États-Unis (EU–US
          Data Privacy Framework). Vous pouvez demander une copie des garanties précises
          sur lesquelles nous nous appuyons en nous écrivant par courriel.
        </Body>

        <SectionHeading n="6" title="Combien de temps nous conservons vos données" />
        <Table
          headers={['Données', 'Conservation']}
          rows={[
            [
              'Brouillons et éléments d’affiches',
              'Aussi longtemps que votre compte existe. Supprimés immédiatement lorsque vous supprimez l’affiche ou votre compte.',
            ],
            [
              'Comptes invités anonymes',
              'Supprimés automatiquement 14 jours après la dernière connexion s’ils n’ont jamais été convertis en compte permanent.',
            ],
            [
              'Commentaires soumis',
              'Conservés pendant l’exploitation du produit, afin que nous puissions suivre l’historique des signalements et des décisions.',
            ],
            [
              'Journaux de serveur/d’erreurs',
              'Jusqu’à 30 jours, puis purgés.',
            ],
            [
              'Registres juridiques/fiscaux',
              'Aussi longtemps que l’exige la loi applicable.',
            ],
          ]}
        />

        <SectionHeading n="7" title="Vos droits" />
        <Body>
          Plusieurs lois sur la protection de la vie privée peuvent s’appliquer à vous
          selon votre lieu de résidence. Postr est exploité depuis le Québec, au Canada,
          de sorte que la Loi fédérale sur la protection des renseignements personnels et
          les documents électroniques (LPRPDE) et la Loi sur la protection des
          renseignements personnels dans le secteur privé du Québec (« Loi 25 »)
          s’appliquent. Si vous vous trouvez dans l’Espace économique européen ou au
          Royaume-Uni, le RGPD de l’UE/du R.-U. s’applique. Si vous êtes en Californie,
          la California Consumer Privacy Act (CCPA) s’applique. Dans l’ensemble de ces
          régimes, vous disposez des droits suivants à l’égard de vos renseignements
          personnels :
        </Body>
        <List
          items={[
            'Accès — demander une copie des renseignements personnels que nous détenons à votre sujet et les catégories de personnes avec qui ils ont été partagés.',
            'Rectification — nous demander de corriger des renseignements inexacts ou incomplets.',
            'Effacement / déréférencement — nous demander de supprimer vos données ou d’en cesser la diffusion, sous réserve des exceptions légales.',
            'Limitation — nous demander de suspendre le traitement pendant le règlement d’un différend.',
            'Portabilité — demander vos données dans un format structuré, couramment utilisé et lisible par machine (RGPD et, depuis septembre 2024, Loi 25 du Québec).',
            'Opposition — vous opposer à un traitement fondé sur notre intérêt légitime.',
            'Retrait du consentement — lorsque le traitement repose sur le consentement, le retirer à tout moment sans que cela n’affecte le traitement déjà effectué.',
            'Non-discrimination (CCPA) — nous ne vous traiterons pas différemment parce que vous exercez vos droits au titre de la CCPA.',
            'Déposer une plainte — auprès de l’autorité compétente (voir ci-dessous).',
          ]}
        />
        <Body>
          Vous pouvez déposer une plainte auprès de la{' '}
          <strong>Commission d’accès à l’information du Québec (CAI)</strong> si vous
          résidez au Québec, du{' '}
          <strong>Commissariat à la protection de la vie privée du Canada (CPVP)</strong>{' '}
          pour les questions relevant de la LPRPDE, de votre autorité locale de
          protection des données de l’UE en vertu du RGPD, de l’
          <strong>Information Commissioner’s Office (ICO) du Royaume-Uni</strong>{' '}
          en vertu du RGPD britannique, ou de la{' '}
          <strong>California Privacy Protection Agency (CPPA)</strong> en vertu de la CCPA.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Droit d’opposition (art. 21 RGPD).</strong>
          <br />
          Vous avez le droit de vous opposer à tout moment — pour des raisons tenant à
          votre situation particulière — au traitement de vos renseignements personnels
          fondé sur notre intérêt légitime, y compris tout profilage. Envoyez un courriel
          à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </CalloutBox>
        <Body>
          Pour exercer l’un de ces droits, écrivez-nous à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . Nous répondrons dans un délai d’un mois, comme l’exige le RGPD. Pour la
          plupart des actions, vous pouvez également utiliser les boutons de votre{' '}
          <Link to="/profile" className="text-[#7c6aed] underline">
            page de profil
          </Link>{' '}
          — y supprimer votre compte efface tout ce qui y est associé.
        </Body>

        <SectionHeading n="8" title="Témoins et technologies semblables" />
        <Body>
          Nous ne déposons que des témoins et des éléments de stockage local strictement
          nécessaires au fonctionnement de l’application — authentifier votre session, se
          souvenir de la dernière affiche que vous avez ouverte et prévenir la
          falsification de requête intersite. Ils ne requièrent pas de consentement au
          titre de la directive « vie privée et communications électroniques »
          (ePrivacy).
        </Body>
        <Body>
          Nous n’exploitons actuellement aucun outil d’analyse ou de suivi publicitaire
          tiers. Si nous ajoutons des outils d’analyse facultatifs à l’avenir, nous
          mettrons à jour le présent avis et demanderons votre consentement explicite
          avant de déposer tout témoin non essentiel.
        </Body>

        <SectionHeading n="9" title="Fonctions d’IA et traitement automatisé" />
        <Body>
          Postr offre une fonction facultative de lisibilité des figures qui transmet le
          code de traçage R ou Python que vous collez à un grand modèle de langage tiers
          (Anthropic Claude) aux fins d’analyse. La réponse sert uniquement à vous
          indiquer si le texte de votre figure sera lisible à la taille d’impression.
        </Body>
        <Body>
          Aucune décision automatisée produisant des effets juridiques ou des effets
          significatifs semblables n’est prise à votre sujet. Le contenu de vos affiches
          et vos données de profil ne servent jamais à entraîner un quelconque modèle
          d’IA.
        </Body>

        <SectionHeading n="10" title="Sécurité" />
        <Body>
          Nous utilisons le chiffrement en transit (HTTPS partout), le chiffrement au
          repos pour la base de données et le stockage, des identifiants de rôle de
          service à portée restreinte, des politiques de sécurité au niveau des lignes sur
          chaque table, et un accès selon le principe du moindre privilège pour toute
          personne qui exploite le service. Aucun système n’est parfaitement sécurisé,
          mais nous prenons des mesures raisonnables adaptées à la taille du service et à
          la sensibilité des données.
        </Body>

        <SectionHeading n="11" title="Données des enfants" />
        <Body>
          Postr s’adresse aux étudiants universitaires, aux stagiaires postdoctoraux et
          aux chercheurs professionnels. Nous ne recueillons pas sciemment de
          renseignements personnels auprès d’enfants de moins de 16 ans. Si vous croyez
          qu’un enfant nous a fourni des renseignements personnels, communiquez avec{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          et nous les supprimerons.
        </Body>

        <SectionHeading n="12" title="Modifications du présent avis" />
        <Body>
          Nous pouvons mettre à jour la présente politique de confidentialité de temps à
          autre à mesure que le produit évolue ou que la loi change. La date de « Dernière
          mise à jour » en haut de la page reflète toujours la version en vigueur. Si une
          modification est importante, nous en informerons les utilisateurs connectés par
          un avis dans l’application ou par courriel avant sa prise d’effet.
        </Body>

        <SectionHeading n="13" title="Nous joindre" />
        <Body>
          Questions, demandes ou plaintes sur la façon dont nous traitons vos
          renseignements personnels :{' '}
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

// ── Blocs partagés ──────────────────────────────────────────

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
