/**
 * Politique de confidentialité — version publique, inspirée du RGPD, en langage clair.
 *
 * Ce document est un point de départ rédigé à partir des mentions standard
 * des articles 13/14 du RGPD, adapté au droit canadien de la protection des
 * renseignements personnels (LPRPDE + Loi 25 du Québec).
 *
 * Twin of Privacy.tsx: it must say what the English says. The data flows
 * in sections 2, 3, 4, 6, 8 and 9 were checked against the code on
 * 2026-10-05 (see the header of Privacy.tsx); change both pages together.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

const LAST_UPDATED = '5 octobre 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function PrivacyFr() {
  useDocumentMeta(STATIC_ROUTE_META['/privacy/fr'] ?? null);

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
        <p className="mt-4 text-sm text-[#8b8f99]">Dernière mise à jour : {LAST_UPDATED}</p>

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
          Voici ce que nous recueillons, regroupé selon ce qui se produit lorsque vous
          utilisez Postr :
        </Body>
        <Table
          headers={['Quand', 'Quoi', 'Obligatoire ?']}
          rows={[
            [
              'À chaque visite',
              'Votre adresse IP et l’agent utilisateur de votre navigateur parviennent à nos hébergeurs à chaque requête, comme pour tout site Web, et peuvent figurer dans leurs journaux. Vercel Web Analytics compte aussi la page vue, comme l’explique la section 8.',
              'Oui. C’est ainsi que le site est diffusé et que les visites sont comptées.',
            ],
            [
              'Lorsque vous ouvrez l’éditeur, commencez en tant qu’invité ou envoyez des commentaires',
              'Un identifiant de compte anonyme, créé automatiquement pour que votre travail puisse être enregistré.',
              'Oui. L’éditeur a besoin d’un compte pour enregistrer votre travail.',
            ],
            [
              'Lors de votre inscription',
              'Votre adresse courriel; le mot de passe que vous choisissez, si vous vous inscrivez avec une adresse courriel, que notre fournisseur d’authentification ne conserve que sous forme hachée; et, si vous vous connectez avec Google, le profil de base transmis par Google (nom, courriel, URL de l’avatar). Nous enregistrons aussi si vous avez accepté les courriels de recherche sur le produit et les courriels sur les nouveautés du produit. Les deux sont désactivés à moins que vous ne cochiez les cases.',
              'Oui, si vous choisissez de créer un compte permanent. Les choix de courriels sont facultatifs.',
            ],
            [
              'Détails du profil (facultatif)',
              'Nom d’affichage, établissement, département, identifiant ORCID, site Web personnel. Ils sont conservés uniquement dans votre navigateur, sur cet appareil. Nos serveurs ne les reçoivent jamais.',
              'Non. Tous facultatifs.',
            ],
            [
              'Lorsque vous modifiez une affiche',
              'Le document de l’affiche lui-même (blocs, styles, auteurs, établissements, références), toute image que vous téléversez, une image d’aperçu de l’affiche, les logos que vous enregistrez dans votre bibliothèque de logos et les versions de l’affiche que vous enregistrez.',
              'Oui. C’est le produit.',
            ],
            [
              'Lorsque vous importez une affiche, copiez un design, analysez une figure ou collez des auteurs ou des références',
              'Les images de page, les images de figure ou le texte collé que vous transmettez, envoyés à un fournisseur de modèle de langage (Anthropic) pour qu’il les lise. La section 9 décrit chaque fonction.',
              'Uniquement si vous utilisez ces fonctions.',
            ],
            [
              'Lorsque vous achetez un forfait',
              'Votre forfait, vos crédits d’exportation, l’état de votre abonnement, la date de votre première exportation payante, ainsi que les identifiants de client et d’abonnement Stripe liés à votre compte. Nous transmettons à Stripe votre adresse courriel et votre identifiant de compte, et Stripe recueille vos renseignements de paiement sur ses propres pages. Nous ne voyons jamais votre numéro de carte.',
              'Uniquement si vous achetez un forfait.',
            ],
            [
              'Lorsque vous envoyez des commentaires',
              'Le titre et le corps de votre message, l’adresse complète de la page où vous vous trouviez et l’agent utilisateur de votre navigateur. Si une importation ou une copie de design échoue et que vous le signalez, le fichier que vous utilisiez et le journal de la console de votre navigateur sont joints, à moins que vous ne les décochiez.',
              'Uniquement si vous soumettez des commentaires.',
            ],
            [
              'Journaux techniques',
              'Les journaux du serveur pour chaque requête (le chemin, le résultat, la durée et votre identifiant de compte), les rapports d’erreurs de l’application (l’erreur, l’endroit où elle s’est produite, l’identifiant de l’affiche et la version de l’application) et, lorsque vous importez une image ou un PDF sans texte sélectionnable, jusqu’à 200 caractères du texte qui en est extrait.',
              'Oui. Pour le débogage et la prévention des abus.',
            ],
          ]}
        />
        <Body>
          Nous ne recueillons <strong>pas</strong> intentionnellement de données de
          catégorie particulière (santé, données biométriques, opinions politiques,
          convictions religieuses, orientation sexuelle, origine ethnique, appartenance
          syndicale, données génétiques). Si vous saisissez vous-même de tels
          renseignements dans un bloc d’affiche, ils sont conservés comme le contenu
          d’affiche que vous avez rédigé. Ils ne sont transmis à un fournisseur de
          modèle de langage que si vous envoyez ce contenu au moyen de l’une des
          fonctions décrites à la section 9.
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
              'Journaux techniques, rapports d’erreurs, ainsi que l’adresse IP et l’agent utilisateur figurant dans les journaux de nos hébergeurs',
            ],
            [
              'Compter les pages vues, pour savoir quelles pages sont utilisées',
              'Intérêt légitime (art. 6(1)(f))',
              'Adresses de page, sans les identifiants d’affiche, et l’adresse de la page d’où vous venez',
            ],
            [
              'Lire les affiches importées, les designs copiés, les figures analysées et les listes d’auteurs ou de références collées au moyen d’un modèle de langage tiers',
              'Contrat, dans le cadre de la fonction que vous avez sollicitée (art. 6(1)(b))',
              'Les images de page, les images de figure et le texte que vous transmettez',
            ],
            [
              'Traiter les paiements et gérer votre forfait',
              'Contrat (art. 6(1)(b))',
              'Adresse courriel, identifiant de compte, forfait et dossiers de facturation',
            ],
            [
              'Répondre aux messages de soutien et de commentaires',
              'Intérêt légitime (art. 6(1)(f))',
              'Contenu des commentaires et tout ce que vous y joignez, coordonnées si vous êtes connecté',
            ],
            [
              'Vous inviter à participer à des recherches sur le produit (entrevues, sondages), uniquement si vous y consentez',
              'Consentement (art. 6(1)(a)), révocable à tout moment',
              'Adresse courriel et toute réponse de recherche que vous choisissez de fournir',
            ],
            [
              'Vous écrire au sujet des nouvelles fonctions et des mises à jour, uniquement si vous y consentez',
              'Consentement (art. 6(1)(a)), révocable à tout moment',
              'Adresse courriel',
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
          écrivons au sujet de recherches sur le produit ou des nouveautés du produit que
          si vous y avez consenti. Vous pouvez désactiver l’un ou l’autre à tout moment
          dans votre page de profil, et cela n’a jamais d’incidence sur votre accès à
          Postr.
        </Body>

        <SectionHeading n="4" title="Qui reçoit vos données" />
        <Body>
          Les services ci-dessous reçoivent des renseignements personnels lorsque vous
          utilisez Postr. Le tableau indique le rôle de chacun et à quel moment il reçoit
          vos données.
        </Body>
        <Table
          headers={['Fournisseur', 'Rôle', 'Emplacement']}
          rows={[
            ['Supabase', 'Base de données, authentification, stockage de fichiers', 'États-Unis (Oregon)'],
            ['Vercel', 'Hébergement de l’application Web, diffusion en périphérie et comptage des pages vues (Vercel Web Analytics)', 'Mondial (principalement aux États-Unis)'],
            ['Render', 'Hébergement de l’API dorsale', 'États-Unis ou autres pays (voir la section 5)'],
            ['Anthropic', 'Modèle de langage qui lit les images et le texte que vous transmettez au moyen des fonctions décrites à la section 9', 'États-Unis'],
            ['Stripe (si vous achetez un forfait)', 'Paiements et abonnements, à titre de marchand officiel', 'Mondial (principalement aux États-Unis)'],
            ['Google', 'Connexion, si vous choisissez la connexion Google. Polices de l’éditeur (Google Fonts), chargées lorsque vous ouvrez l’éditeur. Logos d’universités prédéfinis (service de favicônes), lorsque vous ouvrez le sélecteur de logo, qui affiche d’abord les logos prédéfinis.', 'Mondial'],
            ['Wikimedia Foundation (si vous choisissez un logo prédéfini)', 'Logos d’universités provenant de Wikidata, de Wikipédia et de Wikimedia Commons', 'Mondial (principalement aux États-Unis)'],
          ]}
        />
        <Body>
          Si vous utilisez l’aide à l’impression chez Staples, votre service de courriel
          (Gmail, Outlook.com ou Yahoo Mail) ouvre un brouillon adressé à Staples, avec
          le titre de votre affiche comme objet. Rien n’est envoyé tant que vous ne
          l’envoyez pas vous-même.
        </Body>
        <Body>
          Nous ne communiquons pas vos renseignements personnels à des annonceurs, à des
          courtiers en données ou à des réseaux sociaux. Si une autorité légale émet une
          demande valide contraignant la divulgation, nous nous y conformerons et vous en
          informerons, à moins que la loi ne nous l’interdise.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Partage.</strong>
          <br />
          Postr n’offre pour le moment ni galerie publique ni liens de partage. Rien
          dans l’application ne permet de publier une affiche ou d’en donner l’accès à un
          autre utilisateur de Postr. Si vous avez publié une affiche dans la galerie lorsqu’elle
          était ouverte, vous pouvez la retirer depuis votre{' '}
          <Link to="/profile" className="text-[#7c6aed] underline">
            page de profil
          </Link>
          . Le retrait supprime l’entrée et ses fichiers, mais il ne peut rappeler les
          copies que d’autres ont faites pendant que l’affiche était publique.
        </CalloutBox>

        <SectionHeading n="5" title="Transferts internationaux" />
        <Body>
          Notre base de données et notre stockage de fichiers (Supabase) se trouvent en
          Oregon, aux États-Unis. Votre compte, vos affiches et vos fichiers sont donc
          conservés aux États-Unis, à l’extérieur du Québec et du Canada. Les autres
          services ci-dessus, y compris l’hébergeur de notre API (Render), peuvent
          traiter vos données aux États-Unis ou dans d’autres pays. Lorsque vos
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
              'Affiches et versions que vous enregistrez',
              'Jusqu’à ce que vous supprimiez l’affiche ou votre compte.',
            ],
            [
              'Images que vous téléversez dans une affiche et images d’aperçu des affiches',
              'Jusqu’à ce que vous supprimiez votre compte. La suppression d’une affiche ne supprime pas ces fichiers.',
            ],
            [
              'Logos de votre bibliothèque de logos',
              'Jusqu’à ce que vous supprimiez le logo ou votre compte.',
            ],
            [
              'Images transmises pour une importation ou une copie de design',
              'Téléversées dans un stockage temporaire pour que le modèle de langage les lise, puis supprimées par l’application à la fin de cette étape. Celles dont la suppression échoue restent jusqu’à ce que vous supprimiez votre compte.',
            ],
            [
              'Comptes invités anonymes',
              'Une tâche hebdomadaire supprime les comptes invités qui n’ont jamais été convertis en compte permanent, une fois 14 jours écoulés depuis leur dernière connexion. Cette tâche ne supprime pas les fichiers téléversés par l’invité.',
            ],
            [
              'Commentaires soumis',
              'Conservés pendant l’exploitation du produit, afin que nous puissions suivre l’historique des signalements et des décisions. Ils sont conservés après la suppression de votre compte. Un fichier que vous avez joint est supprimé avec votre compte.',
            ],
            [
              'Registre de suppression de compte',
              'Lorsque vous supprimez votre compte, nous conservons votre identifiant de compte, votre identifiant de client Stripe, les identifiants des abonnements que nous avons annulés et le nombre de fichiers supprimés. Aucune date de suppression n’est fixée.',
            ],
            [
              'Copies dans les caches et les sauvegardes',
              'Des données supprimées peuvent subsister dans les caches et les sauvegardes de nos fournisseurs jusqu’à l’expiration de ces copies. Nos fournisseurs fixent ce délai. Nous n’avons pas fixé de durée plus courte.',
            ],
            [
              'Journaux de serveur/d’erreurs',
              'Conservés aussi longtemps que nos hébergeurs conservent leurs journaux. Nous n’avons pas fixé de durée plus courte.',
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
          vous pourriez aussi avoir des droits en vertu de la California Consumer Privacy
          Act (CCPA). Dans l’ensemble de ces
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
          . Nous répondrons dans un délai d’un mois, comme l’exige le RGPD. Votre{' '}
          <Link to="/profile" className="text-[#7c6aed] underline">
            page de profil
          </Link>{' '}
          vous permet aussi de télécharger les détails de votre compte, vos affiches et
          vos commentaires dans un fichier JSON, de modifier vos choix de courriels et de
          supprimer votre compte. La suppression de votre compte annule tout abonnement
          et supprime votre compte, vos affiches et vos fichiers téléversés. Elle met fin
          sur-le-champ à un forfait à terme payé, sans remboursement pour le reste de la
          période, et retire les crédits d’exportation inutilisés. La section 6 indique
          ce que nous conservons ensuite.
        </Body>

        <SectionHeading n="8" title="Témoins et technologies semblables" />
        <Body>
          Postr ne dépose aucun témoin. Il conserve quelques éléments dans le stockage de
          votre navigateur : votre session de connexion, un marqueur qui détecte lorsque
          la même affiche est ouverte dans deux onglets, des valeurs temporaires qui ne
          durent que le temps de l’onglet en cours, ainsi que les réglages et les notes
          que vous créez, comme les styles enregistrés, les palettes, les notes du
          bloc-notes et les détails de votre profil. Nous ne les utilisons que pour faire
          fonctionner les fonctions que vous utilisez. C’est pourquoi nous ne demandons
          pas de consentement avant de les enregistrer. La{' '}
          <Link to="/cookies/fr" className="text-[#7c6aed] underline">
            Politique relative aux témoins
          </Link>{' '}
          les décrit.
        </Body>
        <Body>
          Nous comptons les pages vues au moyen de Vercel Web Analytics. Cet outil ne
          dépose aucun témoin et n’écrit rien dans votre navigateur. Avant l’envoi d’une
          adresse de page, tout identifiant d’affiche qu’elle contient est remplacé par un
          espace réservé et la chaîne de requête est retirée. L’adresse de la page d’où
          vous venez peut aussi être transmise, et Postr ne la retire pas. Nous
          n’utilisons aucun outil de suivi publicitaire. Si nous devions un jour enregistrer ou lire quoi que ce
          soit sur votre appareil à une fin facultative, nous vous demanderions d’abord
          votre consentement.
        </Body>

        <SectionHeading n="9" title="Fonctions d’IA et traitement automatisé" />
        <Body>
          Certaines fonctions de Postr transmettent du contenu à un grand modèle de
          langage tiers, Claude d’Anthropic, qui le lit et renvoie des résultats
          structurés :
        </Body>
        <List
          items={[
            'Importer une affiche à partir d’un PDF ou d’une image : une image de la page, ou des parties de celle-ci, pour que le modèle repère les figures, les logos et le texte.',
            '« Copy a design » (copier un design) : une image de l’affiche que vous choisissez, pour que le modèle reconnaisse ses polices et l’usage de ses couleurs.',
            '« Scan image » dans l’onglet Figure de l’éditeur : l’image sélectionnée, pour que le modèle repère son texte et mesure la taille à laquelle il sera imprimé.',
            'Coller une liste d’auteurs ou de références : le texte collé, pour que le modèle le sépare en noms, en affiliations et en références.',
          ]}
        />
        <Body>
          Rien n’est transmis tant que vous n’utilisez pas l’une de ces fonctions. Nous
          utilisons les résultats pour remplir votre affiche dans l’éditeur, où vous
          pouvez les modifier ou les supprimer. La vérification de lisibilité des figures
          pour le code R ou Python collé s’exécute dans votre navigateur et n’envoie ce
          code nulle part.
        </Body>
        <Body>
          Aucune décision automatisée produisant des effets juridiques ou des effets
          significatifs semblables n’est prise à votre sujet. Nous n’utilisons pas le
          contenu de vos affiches pour entraîner un quelconque modèle d’IA, et les
          détails de votre profil ne quittent jamais votre navigateur.
        </Body>

        <SectionHeading n="10" title="Sécurité" />
        <Body>
          Nous utilisons le chiffrement en transit (HTTPS partout), le chiffrement au
          repos pour la base de données et le stockage, et des politiques de sécurité au
          niveau des lignes sur chaque table. La clé d’accès complet à la base de données
          est conservée sur notre serveur et n’est jamais transmise à votre navigateur.
          Aucun système n’est parfaitement sécurisé,
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
