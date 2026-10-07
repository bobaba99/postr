/**
 * Politique de confidentialité — version publique, en termes clairs, le
 * Canada d'abord.
 *
 * Twin of Privacy.tsx: it says what the English says, sentence for
 * sentence, in Quebec French (owner decisions of 2026-10-06; record
 * docs/fixes/24-legal-canada-law25.md). The person in charge is published
 * as a role of Resila Technologies Inc. (« Responsable de la protection des
 * renseignements personnels »), never a person. The data flows were read
 * from the code on 2026-10-06 (see the header of Privacy.tsx and
 * docs/legal/quebec-law-25.md); change both pages together.
 * pages/__tests__/legalPagesContent.test.tsx checks the required elements
 * and that both pages have the same shape.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

const LAST_UPDATED = '6 octobre 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function PrivacyFr() {
  useDocumentMeta(STATIC_ROUTE_META['/privacy/fr'] ?? null);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
            Juridique
          </div>
          <Link to="/privacy" className="text-[#7c6aed] underline text-sm">
            English
          </Link>
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">
          Politique de confidentialité
        </h1>
        <p className="mt-4 text-sm text-[#8b8f99]">Dernière mise à jour : {LAST_UPDATED}</p>

        <div className="mt-8">
          <Body>
            La présente politique explique quels renseignements personnels Postr
            recueille, pourquoi, qui les reçoit, combien de temps ils sont conservés et
            comment exercer vos droits. Postr est exploité depuis le Québec, au Canada :
            la politique suit donc la Loi sur la protection des renseignements personnels
            dans le secteur privé du Québec (la « Loi 25 ») et la Loi sur la protection
            des renseignements personnels et les documents électroniques du Canada
            (LPRPDE). Les sections 15 et 16 ajoutent ce qui s’applique si vous êtes dans
            l’Union européenne, au Royaume-Uni ou aux États-Unis.
          </Body>
        </div>

        <SectionHeading n="1" title="Qui est responsable de vos renseignements" />
        <Body>
          Postr est un éditeur d’affiches pour les chercheurs. Il est exploité par{' '}
          <strong className="text-[#e2e2e8]">Resila Technologies Inc.</strong>{' '}
          (« Resila », « nous »), une société constituée au Québec, au Canada. Resila
          est responsable des renseignements personnels que Postr recueille.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Responsable de la protection des renseignements personnels, Resila
            Technologies Inc.
          </strong>
          <br />
          Courriel :{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          <br />
          Écrivez au responsable de la protection des renseignements personnels pour
          toute question, demande ou plainte au sujet de vos renseignements personnels.
        </CalloutBox>

        <SectionHeading n="2" title="Ce que nous recueillons, et comment" />
        <Body>
          Le tableau énumère tout ce que Postr recueille, à quel moment, et comment.
        </Body>
        <Table
          headers={['Quand', 'Ce que nous recueillons', 'Comment, et est-ce nécessaire ?']}
          rows={[
            [
              'À chaque visite',
              'Votre adresse IP, l’agent utilisateur de votre navigateur (son nom et sa version) et l’adresse de la page que vous ouvrez.',
              'Votre navigateur les transmet à chaque requête, comme pour tout site Web. Nos hébergeurs les reçoivent et peuvent les conserver dans leurs journaux. Nécessaire pour diffuser le site.',
            ],
            [
              'Comptage des pages vues',
              'L’adresse de la page que vous consultez, où tout identifiant d’affiche est remplacé et la chaîne de requête retirée; et, sur la première page que vous ouvrez, l’adresse du site Web qui vous a envoyé vers Postr, s’il y en a un. À partir de la requête, Vercel peut aussi enregistrer une localisation approximative ainsi que votre type d’appareil, votre système d’exploitation et votre navigateur.',
              'Un script Vercel Web Analytics du site les transmet. Il n’est pas chargé lorsque votre navigateur envoie le signal Global Privacy Control. La section 6 l’explique.',
            ],
            [
              'Lorsque vous ouvrez l’éditeur ou envoyez des commentaires sans compte',
              'Un compte invité : un identifiant aléatoire, pour que votre travail puisse être enregistré.',
              'Notre service de connexion le crée automatiquement. Nécessaire pour enregistrer votre travail.',
            ],
            [
              'Lorsque vous créez un compte',
              'Votre adresse courriel; votre mot de passe, si vous en choisissez un, que notre service de connexion ne conserve que sous une forme brouillée (hachée); si vous vous connectez avec Google, le profil de base que Google transmet (nom, adresse courriel, adresse de la photo); et si vous avez accepté les courriels de recherche et les courriels sur les nouveautés du produit.',
              'Vous les saisissez sur la page d’inscription, ou Google les transmet lorsque vous choisissez Google. Les choix de courriels sont facultatifs et désactivés à moins que vous ne cochiez les cases.',
            ],
            [
              'Détails du profil',
              'Nom d’affichage, établissement, département, identifiant ORCID et site Web.',
              'Vous les saisissez sur votre page Profil. Ils restent dans votre navigateur, sur cet appareil : nos serveurs ne les reçoivent jamais. Facultatif.',
            ],
            [
              'Lorsque vous créez une affiche',
              'L’affiche elle-même (son texte, ses blocs, ses styles, ses auteurs, ses établissements et ses références), les images que vous téléversez, une image d’aperçu de l’affiche, les logos que vous enregistrez dans votre bibliothèque de logos et les versions que vous enregistrez.',
              'Vous les créez dans l’éditeur, qui les enregistre dans notre base de données et notre stockage de fichiers. Nécessaire : c’est le produit.',
            ],
            [
              'Lorsque vous importez une affiche, copiez un design, analysez une image ou collez des auteurs ou des références',
              'Les images de page, l’image ou le texte collé que vous transmettez.',
              'Vous lancez la fonction. L’application envoie le contenu, par notre API, à un fournisseur de modèle de langage, Anthropic, qui le lit (section 7). Uniquement si vous utilisez ces fonctions.',
            ],
            [
              'Lorsque vous achetez un forfait',
              'Votre forfait, vos crédits d’exportation, l’état de votre abonnement, la date de votre première exportation payante, les remboursements éventuels, ainsi que les identifiants de client et d’abonnement Stripe liés à votre compte.',
              'Vous payez sur les pages de Stripe, et Stripe indique à notre API ce que vous avez acheté. Stripe recueille vos renseignements de paiement; nous ne voyons jamais votre numéro de carte. Uniquement si vous achetez un forfait.',
            ],
            [
              'Lorsque vous envoyez des commentaires',
              'Votre message (son titre et son texte), l’adresse complète de la page où vous étiez et l’agent utilisateur de votre navigateur. Si une importation ou une copie de design échoue et que vous le signalez : le fichier que vous utilisiez, à moins que vous ne le décochiez, et le journal de la console de votre navigateur, seulement si vous le cochez.',
              'Vous soumettez le formulaire de commentaires. Uniquement si vous envoyez des commentaires.',
            ],
            [
              'Registres techniques',
              'Une ligne pour chaque requête à notre API (le chemin, le résultat, la durée et votre identifiant de compte); les rapports d’erreurs de l’application (l’erreur, l’endroit où elle s’est produite, l’identifiant de l’affiche et la version de l’application); et, lorsque vous importez une image ou un PDF sans texte sélectionnable, jusqu’à 200 caractères du texte qui en est extrait.',
              'Notre API les écrit automatiquement. Nécessaire pour trouver les erreurs et prévenir les abus.',
            ],
          ]}
        />
        <Body>
          Nous ne demandons pas de renseignements sensibles (santé, données
          biométriques, opinions politiques, convictions religieuses, orientation
          sexuelle, origine ethnique, appartenance syndicale, données génétiques). Si
          vous saisissez vous-même de tels renseignements dans une affiche, ils sont
          conservés comme l’affiche que vous avez rédigée. Ils ne sont transmis au
          fournisseur de modèle de langage que si vous envoyez ce contenu au moyen de
          l’une des fonctions de la section 7.
        </Body>

        <SectionHeading n="3" title="Pourquoi nous les utilisons" />
        <Table
          headers={['Finalité', 'Renseignements utilisés']}
          rows={[
            ['Faire fonctionner l’éditeur, enregistrer votre travail et vous permettre de vous connecter', 'Votre compte, vos affiches, les registres techniques'],
            ['Lire les fichiers et le texte que vous transmettez au moyen des fonctions d’importation, de copie de design, d’analyse d’image et de collage', 'Le contenu que vous transmettez'],
            ['Recevoir les paiements et gérer votre forfait', 'Votre adresse courriel, votre identifiant de compte, votre forfait et vos dossiers de facturation'],
            ['Répondre à vos commentaires, questions et demandes', 'Vos commentaires, et votre adresse courriel si vous avez un compte'],
            ['Trouver les erreurs, assurer la sécurité du service et prévenir les abus', 'Les registres techniques, et l’adresse IP et l’agent utilisateur dans les journaux de nos hébergeurs'],
            ['Compter les pages vues, pour savoir quelles pages sont utilisées', 'Les renseignements du comptage décrits à la section 6'],
            ['Vous inviter à des recherches sur le produit, seulement si vous l’avez accepté', 'Votre adresse courriel, et les réponses que vous choisissez de donner'],
            ['Vous informer par courriel des nouveautés, seulement si vous l’avez accepté', 'Votre adresse courriel'],
            ['Respecter nos obligations légales, comme les règles fiscales et comptables', 'Ce que l’obligation exige'],
          ]}
        />
        <Body>
          Nous utilisons vos renseignements uniquement à ces fins, à d’autres fins que
          la loi permet, ou avec votre consentement. Nous ne les vendons pas, nous ne
          les utilisons pas à des fins publicitaires et nous n’utilisons pas vos
          affiches pour entraîner un modèle d’IA. Lorsque nous nous fondons sur votre
          consentement (les deux listes de courriels facultatives), vous pouvez le
          retirer en tout temps, comme l’explique la section 10, sans que cela nuise à
          votre accès à Postr.
        </Body>

        <SectionHeading n="4" title="Qui reçoit vos renseignements" />
        <Body>
          Nous ne vendons ni ne louons vos renseignements personnels. Les fournisseurs
          de services ci-dessous les reçoivent pour faire fonctionner Postr, chacun pour
          sa propre part. Les trois premiers font fonctionner Postr lui-même.
        </Body>
        <Table
          headers={['Fournisseur', 'Ce qu’il fait pour Postr', 'Ce qu’il reçoit, et quand']}
          rows={[
            [
              'Vercel',
              'Héberge le site Web : il transmet chaque page et l’application à votre navigateur, et compte les pages vues (Vercel Web Analytics).',
              'Pour chaque page que vous chargez : votre adresse IP, votre agent utilisateur et l’adresse de la page. Pour le comptage des pages vues : les renseignements de la section 6, sauf si votre navigateur envoie le signal Global Privacy Control.',
            ],
            [
              'Render',
              'Fait fonctionner notre API, le serveur qui traite les importations, les fonctions de collage, les paiements, les remboursements, la suppression des comptes et les rapports d’erreurs.',
              'Pour chaque requête que l’application fait à l’API : votre adresse IP, votre agent utilisateur et votre identifiant de compte, ainsi que le contenu de cette requête (par exemple une liste de références collée, une image à lire ou un rapport d’erreur).',
            ],
            [
              'Supabase',
              'Notre base de données, notre service de connexion et notre stockage de fichiers. Il envoie aussi les courriels qui confirment une adresse ou vous permettent de vous connecter.',
              'Tout ce qui est enregistré avec votre compte : votre compte et votre adresse courriel, vos affiches, vos versions, vos images téléversées, vos logos, vos commentaires, vos choix de courriels et les dossiers de votre forfait. Chaque fois que vous utilisez l’éditeur ou votre compte.',
            ],
            [
              'Anthropic',
              'Un modèle de langage qui lit le contenu que vous transmettez au moyen des fonctions de la section 7 et renvoie des résultats structurés.',
              'Par notre API, uniquement lorsque vous utilisez l’une de ces fonctions : les images de page, l’image ou le texte collé.',
            ],
            [
              'Stripe',
              'Reçoit les paiements et gère les abonnements au moyen de son service de marchand officiel (merchant of record), qui calcule et perçoit aussi les taxes.',
              'De notre API lorsque vous commencez un paiement : votre adresse courriel et votre identifiant de compte. Sur les pages de Stripe : vos renseignements de paiement. Uniquement si vous achetez un forfait.',
            ],
            [
              'Google',
              'La connexion avec Google, si vous la choisissez; les polices de l’éditeur (Google Fonts); les icônes d’universités affichées dans le sélecteur de logos.',
              'Connexion : ce que vous acceptez de partager sur les pages de Google. Polices : votre adresse IP et votre agent utilisateur, chaque fois que l’éditeur charge une police. Sélecteur de logos : votre adresse IP et votre agent utilisateur lorsqu’il affiche ses icônes prédéfinies.',
            ],
            [
              'Fondation Wikimedia',
              'Les logos d’universités provenant de Wikidata, de Wikipédia et de Wikimedia Commons.',
              'Votre adresse IP et votre agent utilisateur, lorsque vous choisissez un logo prédéfini.',
            ],
          ]}
        />
        <Body>
          Si vous utilisez l’aide à l’impression Staples, votre service de courriel
          (Gmail, Outlook.com ou Yahoo Mail) ouvre un brouillon adressé à Staples avec
          le titre de votre affiche comme objet. Rien n’est envoyé tant que vous ne
          l’envoyez pas vous-même.
        </Body>
        <Body>
          Nous ne communiquons pas vos renseignements personnels aux annonceurs, aux
          courtiers en données ni aux réseaux sociaux. Si une autorité légale émet une
          ordonnance valide qui nous oblige à communiquer des renseignements, nous nous
          y conformerons et nous vous en informerons, à moins que la loi ne l’interdise.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Partage.</strong>
          <br />
          Postr n’a ni galerie publique ni liens de partage pour le moment. Aucune
          commande de l’application ne publie une affiche ni ne donne accès à une
          affiche à un autre utilisateur de Postr. Si vous avez publié une affiche dans
          la galerie pendant qu’elle était ouverte, vous pouvez la retirer depuis votre{' '}
          <Link to="/profile" className="text-[#7c6aed] underline">
            page Profil
          </Link>
          . Le retrait supprime l’entrée et ses fichiers, mais ne peut pas récupérer les
          copies que d’autres ont faites pendant que l’affiche était publique.
        </CalloutBox>

        <SectionHeading n="5" title="Renseignements communiqués à l’extérieur du Québec" />
        <Body>
          Resila est au Québec, mais les fournisseurs de la section 4 conservent et
          traitent vos renseignements à l’extérieur du Québec et du Canada, aux
          États-Unis ou dans d’autres pays. Nous les leur communiquons uniquement aux
          fins de la section 3, selon leurs conditions de service. Les renseignements
          conservés dans un autre pays sont soumis aux lois de ce pays, et ses tribunaux
          ou ses autorités pourraient les obtenir. Écrivez au responsable de la
          protection des renseignements personnels pour savoir comment un fournisseur
          donné protège vos renseignements.
        </Body>

        <SectionHeading n="6" title="Comptage des pages vues, témoins et stockage du navigateur" />
        <Body>
          Nous comptons les pages vues avec Vercel Web Analytics, et nous n’utilisons
          aucun autre outil d’analyse. Il ne dépose aucun témoin et ne stocke rien dans votre
          navigateur. Pour chaque page que vous consultez, il transmet à Vercel
          l’adresse de la page, où tout identifiant d’affiche est remplacé par une
          valeur générique et la chaîne de requête retirée. Sur la première page que
          vous ouvrez, il transmet aussi l’adresse du site Web qui vous a envoyé vers
          Postr, s’il y en a un. Comme toute requête, il transporte votre adresse IP et
          votre agent utilisateur, qui permettent de déduire une localisation
          approximative et votre appareil. Selon la documentation de Vercel, celui-ci
          peut enregistrer avec chaque page vue une localisation approximative (pays,
          région et ville), votre type d’appareil, votre système d’exploitation et
          votre navigateur. Vercel indique aussi qu’il distingue les visites au moyen d’une
          valeur dérivée de la requête et supprimée dans les 24 heures, et que les
          pages vues qu’il enregistre ne sont liées ni à vous ni à votre adresse IP.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Comment vous y opposer.</strong> Si votre
          navigateur envoie le signal Global Privacy Control (un réglage de
          confidentialité offert par certains navigateurs, comme Firefox, Brave et
          DuckDuckGo), Postr ne charge pas du tout Vercel Web Analytics : vos pages
          vues ne sont pas comptées. Vous pouvez aussi vous opposer au comptage en
          écrivant au responsable de la protection des renseignements personnels. Le
          comptage ne conserve aucun identifiant qui vous concerne : c’est donc le
          signal Global Privacy Control, ou le blocage du script dans votre navigateur,
          qui l’arrête pour votre navigateur.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Google Fonts.</strong> L’éditeur charge
          ses polices depuis Google Fonts, le service de polices de Google. Chaque fois,
          votre navigateur transmet à Google votre adresse IP et votre agent
          utilisateur, comme pour toute requête. Google ne reçoit aucun contenu
          d’affiche. Les pages publiques du site ne chargent pas Google Fonts.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Stockage du navigateur.</strong> Postr ne
          dépose aucun témoin. Il conserve quelques éléments dans le stockage de votre
          navigateur : votre session de connexion, un marqueur qui détecte quand la
          même affiche est ouverte dans deux onglets, des valeurs de courte durée pour
          l’onglet ouvert, ainsi que les réglages et les notes que vous créez, comme les
          styles enregistrés, les palettes, les notes du bloc-notes, les scripts de
          graphique que vous placez dans la vérification de figure et les détails de
          votre profil. Nous les utilisons seulement pour faire fonctionner les
          fonctions que vous utilisez. La{' '}
          <Link to="/cookies/fr" className="text-[#7c6aed] underline">
            Politique relative aux témoins
          </Link>{' '}
          énumère chacun d’eux.
        </Body>

        <SectionHeading n="7" title="Fonctions de modèle de langage, profilage et décisions automatisées" />
        <Body>
          Quatre fonctions transmettent du contenu à un modèle de langage, Claude
          d’Anthropic, qui le lit et renvoie des résultats structurés :
        </Body>
        <List
          items={[
            'Importer une affiche à partir d’un PDF ou d’une image : une image de la page, ou de parties de celle-ci, pour que le modèle trouve les figures, les logos et le texte.',
            'Copier un design : une image de l’affiche que vous choisissez, pour que le modèle reconnaisse ses polices et l’usage de ses couleurs.',
            '« Scan image » dans l’onglet Figure de l’éditeur : l’image sélectionnée, pour que le modèle trouve son texte et mesure la taille qu’il aura à l’impression.',
            'Coller une liste d’auteurs ou de références : le texte collé, pour que le modèle le divise en noms, affiliations et références.',
          ]}
        />
        <Body>
          Rien n’est transmis tant que vous n’utilisez pas l’une de ces fonctions. Les
          résultats remplissent votre affiche dans l’éditeur, où vous pouvez les
          modifier ou les retirer. Le vérificateur de graphiques pour le code R ou
          Python collé fonctionne dans votre navigateur et n’envoie votre code nulle
          part.
        </Body>
        <Body>
          Hormis la localisation approximative que Vercel déduit de chaque page vue
          (section 6), Postr n’utilise aucune technologie qui permet de vous
          identifier, de vous localiser ou d’effectuer votre profilage : rien ne
          reconnaît votre visage ou votre voix, ne suit l’endroit où vous êtes ni ne
          dresse le profil de vos intérêts ou de votre comportement. Nous utilisons le
          comptage des pages vues uniquement pour savoir combien de personnes
          consultent chaque page, jamais pour localiser une personne en particulier.
          Le signal Global Privacy Control désactive le comptage des pages vues
          (section 6); aucune autre fonction de ce genre n’existe à activer ou à
          désactiver.
        </Body>
        <Body>
          Aucune décision vous concernant n’est fondée exclusivement sur un traitement
          automatisé, à une petite exception près : le bouton de remboursement de votre
          page Profil applique la règle de remboursement des{' '}
          <Link to="/terms/fr#refunds" className="text-[#7c6aed] underline">
            Conditions d’utilisation
          </Link>{' '}
          à vos dossiers d’achat et d’exportation. S’il refuse, vous pouvez demander un
          remboursement par courriel; une personne examinera alors votre demande et vous
          indiquera les renseignements et les raisons qui fondent la réponse.
        </Body>

        <SectionHeading n="8" title="Confidentialité par défaut" />
        <Body>Ces réglages partent du choix le plus confidentiel :</Body>
        <List
          items={[
            'Les courriels de recherche et sur les nouveautés du produit sont désactivés tant que vous ne les cochez pas.',
            'Lorsque vous signalez l’échec d’une importation ou d’une copie de design, le journal de la console de votre navigateur n’est pas envoyé à moins que vous ne le cochiez.',
            'Les détails de votre profil restent dans votre navigateur.',
            'Rien de ce que vous créez n’est publié : il n’y a ni galerie ni lien de partage pour le moment.',
            'Rien n’est transmis au modèle de langage tant que vous n’utilisez pas une fonction qui en a besoin.',
          ]}
        />
        <Body>
          Deux choses ne partent pas du choix le plus confidentiel. Le comptage des
          pages vues est activé par défaut. Il n’est pas chargé lorsque votre
          navigateur envoie le signal Global Privacy Control, et la section 6 explique
          comment vous y opposer. De plus, lorsque vous signalez l’échec d’une
          importation ou d’une copie de design, la case qui joint le fichier que vous
          importiez est cochée au départ, puisque le signalement porte sur lui; vous
          pouvez la décocher avant l’envoi.
        </Body>

        <SectionHeading n="9" title="Durée de conservation, et destruction" />
        <Table
          headers={['Renseignements', 'Durée']}
          rows={[
            ['Les affiches et les versions que vous enregistrez', 'Jusqu’à ce que vous supprimiez l’affiche ou votre compte.'],
            [
              'Les images que vous téléversez dans une affiche, et les images d’aperçu des affiches',
              'Jusqu’à ce que vous supprimiez votre compte. La suppression d’une affiche ne supprime pas ces fichiers.',
            ],
            ['Les logos de votre bibliothèque de logos', 'Jusqu’à ce que vous supprimiez le logo ou votre compte.'],
            [
              'Les images envoyées pour une importation ou une copie de design',
              'Placées dans un stockage temporaire pour que le modèle de langage les lise, puis supprimées par l’application à la fin de cette étape. Celles dont la suppression échoue restent jusqu’à ce que vous supprimiez votre compte.',
            ],
            [
              'Les comptes invités',
              'Une tâche hebdomadaire supprime les comptes invités qui n’ont jamais été convertis en compte permanent, une fois écoulés 14 jours depuis leur dernière connexion. La tâche ne supprime pas les fichiers téléversés par l’invité; aucune durée n’est fixée pour eux.',
            ],
            [
              'Les commentaires',
              'Conservés tant que Postr est exploité, afin de suivre les signalements et les décisions. Lorsque vous supprimez votre compte, vos commentaires restent, et le champ qui les relie à votre compte est effacé. Leur texte reste tel que vous l’avez envoyé, avec tout journal de la console que vous avez choisi d’envoyer. Si vous avez joint un fichier, ce fichier est supprimé avec votre compte, mais vos commentaires indiquent encore où il était stocké, et cette indication contient votre identifiant de compte.',
            ],
            [
              'Le registre d’une suppression de compte',
              'Lorsque vous supprimez votre compte, nous conservons votre identifiant de compte, votre identifiant de client Stripe, les identifiants des abonnements que nous avons annulés et le nombre de fichiers retirés, afin de faire correspondre les événements de paiement ultérieurs. Aucune date de fin n’est fixée.',
            ],
            [
              'Les journaux de l’API et les rapports d’erreurs',
              'Aussi longtemps que nos hébergeurs conservent les journaux. Nous n’avons pas fixé de durée plus courte.',
            ],
            [
              'Les copies dans les sauvegardes et les caches de nos fournisseurs',
              'Jusqu’à l’expiration de ces copies, selon le calendrier propre à nos fournisseurs.',
            ],
            ['Les dossiers de paiement, fiscaux et comptables', 'Aussi longtemps que la loi l’exige.'],
            [
              'Les éléments dans votre navigateur',
              'Comme l’indique la Politique relative aux témoins. La suppression de votre compte les efface dans le navigateur que vous utilisez pour la faire.',
            ],
          ]}
        />
        <Body>
          Pour détruire des renseignements, nous les supprimons de notre base de
          données et de notre stockage de fichiers. Les copies dans les sauvegardes et
          les journaux de nos fournisseurs disparaissent à l’expiration de ces copies.
        </Body>

        <SectionHeading n="10" title="Vos droits au Canada et au Québec" />
        <Body>
          La Loi 25 et la LPRPDE vous donnent les droits ci-dessous. Pour en exercer
          un, écrivez au responsable de la protection des renseignements personnels à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          depuis l’adresse courriel de votre compte. Un compte invité n’a pas d’adresse
          courriel : indiquez l’identifiant de compte qui figure dans le fichier que
          vous donne « Download my data ». Nous pourrions vous demander de confirmer
          votre identité. Nous répondons par écrit dans les 30 jours suivant la
          réception de votre demande, et l’exercice de vos droits est gratuit.
        </Body>
        <Table
          headers={['Droit', 'Ce qu’il signifie', 'Comment l’exercer dans Postr aujourd’hui']}
          rows={[
            [
              'Accès',
              'Savoir quels renseignements personnels nous détenons à votre sujet, comment nous les utilisons, qui les a reçus et combien de temps nous les conservons, et en obtenir une copie.',
              '« Download my data », sur votre page Profil, vous donne un fichier contenant les détails de votre compte, vos affiches et vos commentaires. Pour tout le reste (versions, logos, images, dossiers de facturation, choix de courriels), écrivez au responsable de la protection des renseignements personnels.',
            ],
            [
              'Rectification',
              'Faire corriger des renseignements inexacts, incomplets ou périmés.',
              'Corrigez vos affiches dans l’éditeur, et les détails de votre profil sur votre page Profil. Pour votre adresse courriel ou tout autre renseignement, écrivez au responsable de la protection des renseignements personnels.',
            ],
            [
              'Retrait du consentement',
              'Retirer un consentement que vous avez donné, en tout temps. Cela n’annule pas ce qui a été fait auparavant.',
              'Désactivez les courriels de recherche ou sur les nouveautés du produit sur votre page Profil, ou écrivez au responsable de la protection des renseignements personnels.',
            ],
            [
              'Suppression',
              'Faire supprimer vos renseignements lorsqu’ils ne sont plus nécessaires, ou qu’ils ont été recueillis ou conservés en contravention de la loi.',
              'Supprimez une affiche depuis votre tableau de bord, un logo depuis votre bibliothèque de logos, ou tout votre compte depuis votre page Profil. La section 9 indique ce qui reste ensuite. Vous pouvez aussi écrire au responsable de la protection des renseignements personnels.',
            ],
            [
              'Désindexation',
              'Nous demander de cesser de diffuser vos renseignements, ou de désindexer un lien rattaché à votre nom qui y donne accès, lorsque leur diffusion contrevient à la loi ou à une ordonnance judiciaire, ou cause un préjudice grave à votre réputation ou à votre vie privée.',
              'Postr ne publie rien à votre sujet pour le moment. Si vous avez publié une affiche dans l’ancienne galerie, retirez-la depuis votre page Profil. Pour tout le reste, écrivez au responsable de la protection des renseignements personnels.',
            ],
            [
              'Portabilité',
              'Recevoir les renseignements que vous nous avez fournis dans un format technologique structuré et couramment utilisé, ou les faire transmettre à une personne ou à un organisme que la loi autorise à les recueillir.',
              '« Download my data » vous donne un fichier JSON des détails de votre compte, de vos affiches et de vos commentaires, et « Save as .postr » dans l’éditeur enregistre une affiche avec ses images. Pour tout le reste, ou pour les faire transmettre ailleurs, écrivez au responsable de la protection des renseignements personnels.',
            ],
            [
              'Explication d’une décision automatisée',
              'Connaître les renseignements et les raisons qui fondent une décision prise exclusivement par traitement automatisé, et la faire réviser par une personne.',
              'Le bouton de remboursement est la seule décision de ce genre (section 7). Écrivez au responsable de la protection des renseignements personnels.',
            ],
            [
              'Plainte',
              'Porter plainte au sujet de la façon dont nous traitons vos renseignements.',
              'Écrivez au responsable de la protection des renseignements personnels, comme l’explique la section 11. Vous pouvez aussi porter plainte auprès de la Commission d’accès à l’information du Québec (CAI) ou du Commissariat à la protection de la vie privée du Canada (CPVP).',
            ],
          ]}
        />
        <Body>
          La suppression de votre compte annule tout abonnement et supprime votre
          compte, vos affiches et vos fichiers téléversés. Elle met fin
          immédiatement à un forfait payé, sans remboursement du reste de la période,
          et retire les crédits d’exportation inutilisés.
        </Body>

        <SectionHeading n="11" title="Notre gouvernance des renseignements personnels" />
        <Body>
          <strong className="text-[#e2e2e8]">Rôles et responsabilités.</strong>{' '}
          Resila Technologies Inc. est responsable des renseignements personnels que
          Postr détient, tout au long de leur cycle de vie : collecte, utilisation,
          communication, conservation et destruction. Son responsable de la protection
          des renseignements personnels approuve la présente politique; décide qui peut
          accéder aux renseignements personnels, ce qui est limité aux personnes qui
          exploitent Postr et à ce que leur travail exige; vérifie qu’un nouveau
          fournisseur ou une nouvelle fonction qui utilise des renseignements
          personnels est décrit dans la présente politique avant sa mise en service;
          tient le registre des incidents de confidentialité; et répond aux demandes et
          aux plaintes.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Collecte, utilisation et conservation.</strong>{' '}
          Nous recueillons ce qu’énumère la section 2, l’utilisons aux fins de la
          section 3, ne le communiquons que comme l’indique la section 4 et le
          conservons comme l’indique la section 9. Les renseignements sont détruits par
          leur suppression, comme l’explique la section 9, à moins que la loi ne nous
          oblige à les conserver.
        </Body>
        <Body>
          <strong className="text-[#e2e2e8]">Plaintes.</strong> Envoyez votre plainte
          au responsable de la protection des renseignements personnels à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . Nous en accusons réception, l’examinons et répondons par écrit dans les 30
          jours en indiquant ce que nous avons constaté et ce que nous ferons. Si vous
          n’êtes pas satisfait, vous pouvez porter plainte auprès de la Commission
          d’accès à l’information du Québec (CAI) ou du Commissariat à la protection de
          la vie privée du Canada (CPVP).
        </Body>

        <SectionHeading n="12" title="Incidents de confidentialité" />
        <Body>
          Si des renseignements personnels font l’objet d’un accès, d’une utilisation
          ou d’une communication non autorisés, ou d’une perte, nous prenons des mesures
          raisonnables pour diminuer le risque de préjudice et éviter que l’incident se
          reproduise, et nous l’inscrivons à notre registre. Si l’incident présente un
          risque de préjudice sérieux, nous en avisons avec diligence la Commission
          d’accès à l’information du Québec et les personnes concernées, ainsi que,
          en vertu de la LPRPDE, le Commissariat à la protection de la vie privée du
          Canada.
        </Body>

        <SectionHeading n="13" title="Sécurité" />
        <Body>
          Toutes les connexions à Postr sont chiffrées (HTTPS). Notre fournisseur de base
          de données et de stockage de fichiers chiffre les données stockées, et chaque
          table de notre base de données a des règles d’accès qui déterminent quel
          compte peut lire ou modifier chaque rangée. La clé d’accès complet à la base
          de données est conservée sur notre serveur et n’est jamais envoyée à votre
          navigateur. Aucun système n’est parfaitement sûr, mais nous prenons des
          mesures raisonnables compte tenu de la taille du service et de la
          sensibilité des renseignements.
        </Body>

        <SectionHeading n="14" title="Enfants" />
        <Body>
          Postr s’adresse aux étudiants universitaires et aux chercheurs. Nous ne
          recueillons pas sciemment de renseignements personnels auprès d’enfants de
          moins de 16 ans. Si vous croyez qu’un enfant nous a fourni des renseignements
          personnels, écrivez au responsable de la protection des renseignements
          personnels et nous les supprimerons.
        </Body>

        <SectionHeading n="15" title="Si vous êtes dans l’Union européenne ou au Royaume-Uni" />
        <Body>
          Le Règlement général sur la protection des données (RGPD) de l’Union
          européenne ou du Royaume-Uni s’applique aussi à vous. Resila Technologies Inc.
          est le responsable du traitement. Voici nos bases juridiques :
        </Body>
        <Table
          headers={['Finalité', 'Base juridique']}
          rows={[
            ['Faire fonctionner l’éditeur, enregistrer votre travail, la connexion', 'Contrat (art. 6, par. 1, point b))'],
            ['Lire le contenu que vous transmettez au moyen des fonctions de la section 7', 'Contrat, dans le cadre de la fonction que vous utilisez (art. 6, par. 1, point b))'],
            ['Les paiements et la gestion de votre forfait', 'Contrat (art. 6, par. 1, point b))'],
            ['Trouver les erreurs, la sécurité et la prévention des abus', 'Intérêt légitime (art. 6, par. 1, point f))'],
            ['Le comptage des pages vues', 'Intérêt légitime (art. 6, par. 1, point f))'],
            ['Répondre aux commentaires et aux demandes', 'Intérêt légitime (art. 6, par. 1, point f))'],
            ['Les invitations à des recherches et les courriels sur les nouveautés', 'Consentement (art. 6, par. 1, point a)), que vous pouvez retirer en tout temps'],
            ['Les obligations légales', 'Obligation légale (art. 6, par. 1, point c))'],
          ]}
        />
        <Body>
          En plus des droits de la section 10, vous pouvez nous demander de limiter le
          traitement pendant le règlement d’un différend, et de transmettre
          directement à un autre organisme, lorsque c’est techniquement possible, les
          renseignements que vous nous avez fournis. Vous pouvez porter plainte auprès
          de l’autorité de contrôle du lieu où vous vivez, travaillez ou croyez que la
          loi a été enfreinte (au Royaume-Uni, l’Information Commissioner’s Office).
          Nous répondons dans un délai d’un mois.
        </Body>
        <Body>
          Vos renseignements sont transférés au Canada, où se trouve Resila, et aux
          États-Unis ou dans d’autres pays, où nos fournisseurs les traitent. La
          Commission européenne et le Royaume-Uni reconnaissent que le Canada offre une
          protection adéquate aux renseignements détenus par les organisations
          assujetties à la LPRPDE. Pour les États-Unis, leurs décisions d’adéquation ne
          couvrent que les entreprises certifiées en vertu du cadre de protection des
          données UE-États-Unis (Data Privacy Framework) ou, pour le Royaume-Uni, de son
          extension britannique. Écrivez au responsable de la protection des
          renseignements personnels pour savoir si une décision d’adéquation ou une
          autre garantie couvre un fournisseur, et pour obtenir une copie de toute
          garantie.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Droit d’opposition (art. 21 du RGPD).</strong>
          <br />
          Vous pouvez vous opposer en tout temps, pour des raisons tenant à votre
          situation, au traitement fondé sur notre intérêt légitime, y compris le
          comptage des pages vues. Écrivez au responsable de la protection des
          renseignements personnels à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          , ou activez le signal Global Privacy Control pour arrêter le comptage dans
          votre navigateur.
        </CalloutBox>

        <SectionHeading n="16" title="Si vous êtes aux États-Unis" />
        <Body>
          Nous ne vendons pas vos renseignements personnels et ne les communiquons pas
          à des fins de publicité fondée sur votre activité sur d’autres sites Web.
          Postr respecte le signal Global Privacy Control, comme l’explique la section
          6. Selon l’État où vous vivez, vous pourriez avoir le droit de savoir ce que
          nous recueillons, d’en obtenir une copie, de le faire corriger ou supprimer,
          et de ne pas être traité différemment parce que vous exercez ces droits.
          Exercez-les comme l’explique la section 10.
        </Body>

        <SectionHeading n="17" title="Modifications de la présente politique" />
        <Body>
          Nous pouvons mettre à jour la présente politique selon l’évolution de Postr ou
          de la loi. La date en haut de la page indique la version en vigueur. Si une
          modification change de façon importante notre utilisation de vos
          renseignements, nous l’indiquerons sur cette page avant son entrée en vigueur
          et, si nous avons votre adresse courriel, nous vous en informerons par
          courriel.
        </Body>

        <SectionHeading n="18" title="Pour nous joindre" />
        <Body>
          Questions, demandes ou plaintes au sujet de vos renseignements personnels : le
          responsable de la protection des renseignements personnels, Resila
          Technologies Inc.,{' '}
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

// ── Composants partagés ─────────────────────────────────────────────

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
