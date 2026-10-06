/**
 * Conditions d'utilisation — publiques, en langage clair.
 *
 * Version française de la page Terms, fournie aux résidents du Québec
 * conformément à la Charte de la langue française. It follows Terms.tsx
 * sentence for sentence, including the owner's decisions of 2026-10-06
 * (record 24; see that file's header), and the statements that precede
 * the clauses that may not apply to a Quebec consumer (Consumer Protection
 * Act s. 19.1; record 24, review round 2). Quebec French: prices as
 * « 18,99 $ CA » with no-break spaces, « lot » for the export pack,
 * Quebec civil-law vocabulary.
 *
 * La section « Votre contenu » est délibérément stricte afin de couvrir
 * la fonction de galerie publique : les utilisateurs déclarent être les
 * titulaires légitimes des droits, ils accordent à Postr une licence
 * d'affichage limitée, et ils indemnisent Postr contre les réclamations
 * de tiers en matière de droit d'auteur.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

const LAST_UPDATED = '6 octobre 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function TermsFr() {
  useDocumentMeta(STATIC_ROUTE_META['/terms/fr'] ?? null);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
            Juridique
          </div>
          <Link to="/terms" className="text-[13px] text-[#7c6aed] underline">
            English
          </Link>
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white">Conditions d’utilisation</h1>
        <p className="mt-4 text-sm text-[#8b8f99]">Dernière mise à jour : {LAST_UPDATED}</p>

        <SectionHeading n="1" title="Entente" />
        <Body>
          Les présentes conditions d’utilisation (« Conditions ») constituent une entente
          juridique entre vous et Postr (« nous »), exploité par{' '}
          <strong className="text-[#e2e2e8]">Resila Technologies Inc.</strong>, une
          société constituée au Québec, au Canada. En créant un
          compte, en vous connectant ou en utilisant autrement Postr, y compris en
          utilisant l’éditeur sans vous inscrire, vous acceptez les présentes
          Conditions. Notre{' '}
          <Link to="/privacy/fr" className="text-[#7c6aed] underline">
            Politique de confidentialité
          </Link>{' '}
          explique comment nous traitons vos renseignements personnels. Si vous
          n’acceptez pas les présentes Conditions, n’utilisez pas le service.
        </Body>

        <SectionHeading n="2" title="Ce qu’est Postr" />
        <Body>
          Postr est un éditeur d’affiches scientifiques. Il vous permet de créer
          des affiches aux formats standard des conférences, de conserver des
          brouillons, d’exporter vos affiches en PDF ou PowerPoint et de
          soumettre de la rétroaction.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Postr héberge votre contenu. Il n’en est pas l’éditeur au sens juridique.
          </strong>
          <br />
          Nous hébergeons et affichons le contenu que vous téléversez. Nous ne le
          vérifions pas quant à son exactitude, son originalité ou sa licéité. Vous
          êtes seul responsable de ce que vous téléversez; voir la section 5
          ci-dessous.
        </CalloutBox>

        <SectionHeading n="3" title="Comptes" />
        <List
          items={[
            'Vous pouvez commencer à utiliser Postr avec une session anonyme et la convertir ultérieurement en un nouveau compte permanent. Toute votre progression est alors transférée. Si vous vous connectez plutôt à un compte que vous possédez déjà, le travail de la session anonyme n’y est pas transféré.',
            'Vous devez fournir des renseignements d’inscription exacts et garder vos identifiants de connexion confidentiels.',
            'Vous devez être âgé d’au moins 16 ans (ou avoir l’âge minimal du consentement numérique dans votre pays) pour créer un compte permanent.',
            'Vous êtes responsable de tout ce qui se produit sous votre compte.',
            'Vous pouvez supprimer votre compte à tout moment depuis votre page Profil. La suppression est permanente et immédiate. Elle met aussi fin sur-le-champ à un forfait à terme payé, sans remboursement pour le reste de la période, et retire les crédits d’exportation inutilisés.',
          ]}
        />

        <SectionHeading n="4" title="Utilisation acceptable" />
        <Body>Vous acceptez de ne pas utiliser Postr pour :</Body>
        <List
          items={[
            'Téléverser, publier ou partager du contenu qui porte atteinte à un droit d’auteur, à une marque de commerce, à un brevet, à un secret commercial, à la vie privée, au droit à l’image ou à tout autre droit d’un tiers.',
            'Téléverser, publier ou partager du contenu diffamatoire, harcelant, menaçant, discriminatoire ou qui incite à la violence.',
            'Téléverser, publier ou partager du contenu qui contient du matériel illicite, des maliciels ou des liens vers des maliciels.',
            'Usurper l’identité d’une personne ou d’une entité, ou déclarer faussement votre affiliation avec l’une d’elles.',
            'Tenter de sonder, d’analyser ou de tester la vulnérabilité du service, de contourner l’authentification ou de perturber d’autres utilisateurs.',
            'Abuser du système de rétroaction, contourner les limites de fréquence ou effectuer une extraction automatisée au-delà de ce que ferait un utilisateur normal.',
            'Utiliser Postr pour entraîner des modèles d’apprentissage automatique sur le contenu d’autres utilisateurs.',
          ]}
        />
        <Body>
          Nous pouvons suspendre ou résilier des comptes — et retirer du contenu — qui
          contreviennent à ces règles, avec ou sans préavis, à notre seule discrétion.
        </Body>

        <SectionHeading n="5" title="Votre contenu" />
        <Body>
          Vous conservez la pleine propriété des affiches, figures, images, textes et
          de tout autre matériel que vous créez ou téléversez sur Postr (« Votre
          contenu »). Rien dans les présentes Conditions ne transfère de droits de
          propriété intellectuelle de vous vers nous.
        </Body>

        <SubHeading>5.1 Vos garanties</SubHeading>
        <Body>
          En téléversant ou en créant quoi que ce soit sur Postr, vous{' '}
          <strong>déclarez et garantissez</strong> que :
        </Body>
        <List
          items={[
            'Vous êtes le titulaire légitime des droits sur Votre contenu, ou vous avez obtenu toutes les licences, autorisations et décharges nécessaires à son utilisation — y compris pour les figures reprises de vos propres articles publiés, les images de coauteurs, les logos d’établissements et les jeux de données de tiers.',
            'Votre contenu ne porte atteinte à aucun droit d’auteur, marque de commerce, brevet, secret commercial, droit à la vie privée, droit à l’image ni à aucun autre droit d’un tiers.',
            'Votre contenu respecte toutes les lois applicables, y compris les règles d’éthique de la recherche et de protection des données de votre établissement et de votre juridiction.',
            'Si Votre contenu comprend des renseignements personnels concernant une personne autre que vous-même (coauteurs, participants à une étude, etc.), vous disposez d’une base légale et des consentements nécessaires pour l’afficher sur Postr.',
          ]}
        />

        <SubHeading>5.2 Licence que vous nous accordez</SubHeading>
        <Body>
          Uniquement pour exploiter le service, vous accordez à Postr une{' '}
          <strong>
            licence limitée, mondiale, libre de redevances et non exclusive pour
            héberger, stocker, reproduire, afficher et transmettre Votre contenu
          </strong>{' '}
          dans la mesure nécessaire à la fourniture des fonctionnalités que vous
          utilisez, par exemple l’enregistrement de vos brouillons, la génération
          d’aperçus, la lecture des PDF et des images que vous importez et la
          production des fichiers que vous exportez.
        </Body>
        <Body>
          Cette licence prend fin lorsque vous supprimez votre compte et, pour une
          affiche, lorsque vous supprimez cette affiche, sauf (a) pour les images que
          vous avez téléversées dans une affiche et son image d’aperçu, qui restent
          stockées après la suppression de l’affiche et sont supprimées lorsque vous
          supprimez votre compte, mais qui restent stockées, avec les autres fichiers téléversés par l’invité,
          lorsque notre nettoyage hebdomadaire supprime un compte invité; (b) pour les copies que les caches techniques
          normaux et les sauvegardes conservent après la suppression; et (c) pour le
          contenu que des tiers ont pu déjà consulter ou télécharger pendant qu’il
          était public.
        </Body>

        <SubHeading>5.3 Partage et galerie publique</SubHeading>
        <Body>
          Les liens de partage et la galerie publique sont désactivés. L’application
          n’offre aucune commande qui publie une affiche ou qui crée un lien
          permettant à une autre personne de l’ouvrir. Si vous avez publié une
          affiche dans la galerie avant sa fermeture, vous pouvez la retirer depuis
          la section « Gallery submissions » de votre page Profil. Nous ne pouvons
          pas rappeler les copies que des tiers ont pu déjà faire.
        </Body>

        <SubHeading>5.4 Droit d’auteur et retraits de type DMCA</SubHeading>
        <Body>
          Si vous estimez qu’un contenu sur Postr porte atteinte à votre droit
          d’auteur, écrivez à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{' '}
          en fournissant : une description de l’œuvre dont vous êtes titulaire, une URL
          vers le contenu prétendument contrefaisant sur Postr, vos coordonnées ainsi
          qu’une déclaration selon laquelle vous croyez de bonne foi que l’utilisation
          n’est pas autorisée. Nous examinerons la demande et y répondrons dans un délai
          raisonnable, et nous pouvons retirer ou désactiver le contenu pendant notre
          enquête. Les contrevenants récidivistes verront leur compte résilié.
        </Body>

        <SubHeading>5.5 Indemnisation</SubHeading>
        <QuebecNotice />
        <Body>
          Vous acceptez de défendre, d’indemniser et de tenir Postr et son exploitant
          indemnes de toute réclamation, demande, perte, dommage, coût ou dépense (y
          compris les honoraires extrajudiciaires raisonnables) découlant de Votre contenu ou
          s’y rapportant — en particulier les réclamations selon lesquelles Votre
          contenu porte atteinte aux droits de propriété intellectuelle, au droit à la
          vie privée ou au droit à l’image d’un tiers. Dans la mesure où la loi
          applicable plafonne ou restreint cette indemnisation, celle-ci est limitée en
          conséquence.
        </Body>

        <SectionHeading n="6" title="Contenu et marques de commerce de Postr" />
        <Body>
          Le logiciel Postr, l’image de marque, le logo, la palette et les modèles
          intégrés nous appartiennent (ou sont utilisés sous licence). Les polices
          offertes dans le menu des polices appartiennent à des tiers et sont
          soumises à leurs propres licences. Vous ne pouvez utiliser nos éléments que dans la mesure
          nécessaire pour créer, exporter et partager les affiches que vous réalisez
          sur Postr. Vous ne pouvez pas réutiliser nos éléments de marque pour
          d’autres produits ou services sans autorisation écrite.
        </Body>

        <SectionHeading n="7" title="Frais, abonnements et remboursements" />
        <Body>
          La création et la modification d’affiches, ainsi que l’exportation d’un PDF
          prêt à imprimer, sont gratuites. Certaines fonctionnalités sont payantes. Les
          prix sont en dollars canadiens (CAD) et avant taxes : les taxes applicables
          sont ajoutées au moment du paiement.
        </Body>
        <List
          items={[
            'Forfait à terme — 18,99\u00a0$\u00a0CA plus les taxes applicables, facturés tous les 4 mois. Un abonnement récurrent qui débloque l’exportation illimitée vers PowerPoint, sans filigrane visible. Il se renouvelle automatiquement tous les 4 mois jusqu’à ce que vous l’annuliez.',
            'Lot d’exportation — 9,99\u00a0$\u00a0CA plus les taxes applicables, une seule fois, pour 3 crédits d’exportation. Chaque exportation PowerPoint utilise un crédit. Les crédits n’expirent jamais.',
          ]}
        />
        <Body>
          Le total, taxes comprises, est affiché au moment du paiement, avant que vous
          ne payiez. Les prix peuvent changer de temps à autre; un changement de prix n’a
          jamais d’incidence sur un achat que vous avez déjà effectué. Les paiements sont
          traités par notre fournisseur de paiement, Stripe, au moyen de son service de
          marchand officiel (merchant of record), qui vous facture, émet vos reçus, et
          calcule et perçoit les taxes.
        </Body>

        <SubHeading>7.1 Annulation de votre abonnement</SubHeading>
        <Body>
          Vous pouvez annuler le forfait à terme à tout moment par l’intermédiaire de
          Stripe, qui gère la facturation de Postr. Le bouton « Manage subscription »
          de votre page Profil vous y mène. L’annulation prend effet à la fin de la
          période que vous avez déjà payée : elle met fin au prochain renouvellement,
          et votre forfait demeure actif jusqu’à la fin de la période payée.
          L’annulation est sans frais et ne constitue pas un remboursement. La seule
          exception est un forfait inutilisé : si vous n’avez pas effectué
          d’exportation PowerPoint payante depuis la facturation, vous pouvez demander
          un remboursement intégral dans les 14 jours suivant cette facturation, et le
          forfait prend fin immédiatement (section 7.2).
        </Body>

        <SubHeading id="refunds">7.2 Remboursements</SubHeading>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Forfait à terme — garantie de remboursement de 14 jours.</strong>
          <br />
          Si vous changez d’avis, nous rembourserons intégralement votre plus récente
          facturation de forfait dans les 14 jours suivant cette facturation, à
          condition que vous n’ayez pas effectué d’exportation PowerPoint payante
          depuis cette facturation. Le remboursement met fin au forfait
          immédiatement, et avec lui à ses exportations PowerPoint.
          Effectuer une exportation payante revient à utiliser le produit que vous
          avez payé, de sorte que la garantie prend fin à ce moment-là. Après 14
          jours, ou une fois que vous avez exporté, la garantie ne couvre plus cette
          facturation. Vous pouvez toujours annuler à tout moment pour interrompre
          les renouvellements futurs.
        </CalloutBox>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Lot d’exportation — remboursable intégralement jusqu’à ce que vous utilisiez un crédit.</strong>
          <br />
          Si vous changez d’avis, nous rembourserons intégralement le montant payé pour
          votre plus récent lot (9,99&nbsp;$&nbsp;CA plus les taxes facturées), à condition
          qu’aucun de vos crédits d’exportation n’ait été utilisé, que ce soit de ce
          lot ou d’un lot antérieur. Chaque crédit correspond à une exportation PowerPoint payée :
          dès qu’un crédit a été utilisé, le lot n’est plus remboursable,
          même en partie. Le remboursement d’un lot retire ses 3 crédits de votre
          compte.
        </CalloutBox>
        <Body>
          Vous pouvez demander un remboursement depuis la section « Subscription » de
          votre page Profil, ou en écrivant à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . Tant qu’un forfait à terme est actif, cette section n’offre que le
          remboursement du forfait. Les remboursements sont retournés sur votre mode
          de paiement d’origine et peuvent prendre quelques jours ouvrables avant
          d’apparaître.
        </Body>
        <Body>
          <strong className="text-[#c8cad0]">Si vous êtes dans l’UE, l’EEE ou au Royaume-Uni :</strong>{' '}
          vous disposez d’un droit légal de rétractation de 14 jours pour un achat à
          distance. Lorsque vous achetez depuis l’invite d’exportation de l’éditeur,
          il vous est demandé de confirmer que vous voulez un accès immédiat et que
          vous comprenez que vous perdez ce droit de rétractation de 14 jours dès que
          vous effectuez une exportation payante (pour le forfait à terme) ou utilisez
          un crédit (pour le lot). Un achat commencé depuis la page « Pricing » ne
          demande pas cette confirmation. Lorsque cette confirmation n’a pas été
          obtenue, votre droit légal de 14
          jours s’applique indépendamment de l’utilisation. Rien dans la présente
          section ne limite les droits de remboursement ou d’annulation dont vous
          disposez en vertu des lois impératives de protection des consommateurs de
          votre pays de résidence.
        </Body>

        <SectionHeading n="8" title="Rétroaction" />
        <Body>
          Si vous soumettez des commentaires, des rapports de bogue ou des demandes de
          fonctionnalités au moyen de l’outil de rétroaction intégré à l’application,
          vous nous accordez le droit d’utiliser ces commentaires pour améliorer le
          service, sans obligation ni paiement à votre égard. N’incluez pas de matériel
          confidentiel dans vos messages de commentaires.
        </Body>

        <SectionHeading n="9" title="Disponibilité, modifications et résiliation" />
        <List
          items={[
            'Nous pouvons modifier, suspendre ou interrompre toute partie de Postr à tout moment, avec ou sans préavis.',
            'Nous ne garantissons pas une disponibilité ininterrompue. Des entretiens planifiés, des correctifs d’urgence et des pannes de tiers surviendront.',
            'Vous pouvez cesser d’utiliser Postr à tout moment. Nous pouvons résilier votre compte en cas de manquement substantiel aux présentes Conditions. Un compte invité qui n’est jamais converti en compte permanent peut être supprimé une fois 14 jours écoulés depuis sa dernière connexion, comme l’explique la Politique de confidentialité.',
            'Les sections qui, de par leur nature, doivent survivre à la résiliation (par exemple, Vos garanties, l’indemnisation, les exclusions de garantie et la limitation de responsabilité) survivront.',
          ]}
        />

        <SectionHeading n="10" title="Exclusions de garantie" />
        <QuebecNotice />
        <CalloutBox>
          <strong className="text-[#e2e2e8]">« Tel quel » et « selon disponibilité ».</strong>
          <br />
          Postr est fourni sans garantie d’aucune sorte, expresse ou implicite, y
          compris (dans la mesure maximale permise par la loi) les garanties de qualité
          marchande, d’adéquation à un usage particulier, d’absence de contrefaçon ainsi
          que de fonctionnement ininterrompu ou sans erreur. La fonction de lisibilité
          des figures est un guide utile, et non une garantie que votre affiche
          s’imprimera correctement.
        </CalloutBox>

        <SectionHeading n="11" title="Limitation de responsabilité" />
        <QuebecNotice />
        <Body>
          Dans la mesure maximale permise par la loi applicable, Postr et son exploitant
          ne seront pas responsables des dommages indirects, accessoires, spéciaux ou
          consécutifs, des dommages-intérêts punitifs, ni d’aucune perte de profits, de
          revenus, de données ou d’achalandage, découlant de votre utilisation du
          service ou s’y rapportant — que ce soit en matière de responsabilité
          contractuelle ou extracontractuelle (y compris la négligence), en vertu d’une
          loi ou de toute autre théorie juridique, et que nous ayons été avisés ou non
          de la possibilité de tels dommages.
        </Body>
        <Body>
          Rien dans les présentes Conditions ne limite la responsabilité en cas de décès
          ou de préjudice corporel causé par notre négligence, de fraude ou de fausse
          déclaration frauduleuse, ni aucune autre responsabilité qui ne peut être
          limitée ou exclue en vertu de la loi applicable. Si vous êtes un
          consommateur, rien dans les présentes Conditions ne vous retire un droit que
          vous confère la Loi sur la protection du consommateur du Québec, ou la loi
          de protection des consommateurs du lieu où vous vivez, et auquel il ne peut
          être renoncé.
        </Body>

        <SectionHeading n="12" title="Droit applicable et différends" />
        <Body>
          Les présentes Conditions sont régies par les lois de la province de Québec et
          les lois fédérales du Canada qui y sont applicables, sans égard aux règles de
          conflit de lois. Tout différend découlant des présentes Conditions ou de votre
          utilisation de Postr sera porté devant les tribunaux siégeant dans le district
          judiciaire de Montréal, au Québec, sous réserve des exceptions ci-dessous.
        </Body>
        <Body>
          Si vous êtes un consommateur au Québec, vous conservez le droit que vous
          confère la Loi sur la protection du consommateur d’intenter une poursuite
          devant le tribunal de votre domicile. Les présentes Conditions n’imposent pas
          l’arbitrage et ne vous empêchent pas d’intenter une action collective ou d’y
          participer. Si vous êtes un consommateur ailleurs, vous conservez aussi tout
          droit que la loi impérative de protection des consommateurs du lieu où vous
          vivez vous confère d’y intenter une poursuite.
        </Body>

        <SectionHeading n="13" title="Modifications des présentes Conditions" />
        <Body>
          Nous pouvons mettre à jour les présentes Conditions à mesure que le produit
          évolue ou que la loi change. La date de « Dernière mise à jour » en haut de la
          page reflète toujours la version en vigueur. Si une modification touche
          substantiellement vos droits, nous en informerons les utilisateurs connectés
          dans l’application ou par courriel avant qu’elle ne prenne effet.
        </Body>
        <QuebecNotice />
        <Body>
          La poursuite de l’utilisation de Postr après la date d’entrée en vigueur
          signifie que vous acceptez les Conditions mises à jour.
        </Body>

        <SectionHeading n="14" title="Nous joindre" />
        <Body>
          Questions, avis ou demandes juridiques :{' '}
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

function SubHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mt-6 mb-3 scroll-mt-24 text-[15px] font-semibold text-[#c8cad0]">
      {children}
    </h3>
  );
}

/**
 * Loi sur la protection du consommateur, art. 19.1 : une stipulation
 * inapplicable au Québec doit être immédiatement précédée d'une mention
 * explicite et présentée de façon évidente à cet effet. Twin of Terms.tsx's
 * QuebecNotice.
 */
function QuebecNotice() {
  return (
    <p className="mb-3 text-[14pt] leading-relaxed text-[#e2e2e8]">
      <strong>
        La clause qui suit ne s’applique pas aux consommateurs du Québec dans la
        mesure où la Loi sur la protection du consommateur l’interdit.
      </strong>
    </p>
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

function CalloutBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-lg border-l-4 border-[#7c6aed] bg-[#111118] p-5 text-[14pt] leading-relaxed text-[#9ca3af]">
      {children}
    </div>
  );
}
