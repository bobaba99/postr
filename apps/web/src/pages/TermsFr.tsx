/**
 * Conditions d'utilisation — publiques, en langage clair.
 *
 * Version française de la page Terms, fournie aux résidents du Québec
 * conformément à la Charte de la langue française.
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

const LAST_UPDATED = '28 juillet 2026';
const CONTACT_EMAIL = 'support@resila.ai';

export default function TermsFr() {
  useDocumentMeta(STATIC_ROUTE_META['/terms'] ?? null);

  return (
    <main className="min-h-screen w-screen bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      <article className="mx-auto max-w-3xl px-8 py-16">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
            Légal
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
          société constituée dans la province de Québec, au Canada. En créant un
          compte, en vous connectant ou en utilisant autrement Postr — y compris en
          consultant la galerie publique sans compte —, vous acceptez les présentes
          Conditions ainsi que notre{' '}
          <Link to="/privacy" className="text-[#7c6aed] underline">
            Politique de confidentialité
          </Link>
          . Si vous n’êtes pas d’accord, n’utilisez pas le service.
        </Body>

        <SectionHeading n="2" title="Ce qu’est Postr" />
        <Body>
          Postr est un éditeur d’affiches scientifiques et une plateforme de partage.
          Il vous permet de créer des affiches de qualité pour conférences, de
          conserver des brouillons, de partager des liens en lecture seule, de
          soumettre des commentaires et — si vous le souhaitez — de publier des
          affiches dans une galerie publique afin que d’autres utilisateurs et
          visiteurs puissent les voir.
        </Body>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Postr est une plateforme de partage, et non un éditeur au sens juridique.
          </strong>
          <br />
          Nous hébergeons et affichons le contenu que vous téléversez. Nous ne le
          vérifions pas quant à son exactitude, son originalité ou sa licéité avant sa
          mise en ligne. Vous êtes seul responsable de ce que vous publiez — voir la
          section 5 ci-dessous.
        </CalloutBox>

        <SectionHeading n="3" title="Comptes" />
        <List
          items={[
            'Vous pouvez commencer à utiliser Postr avec une session anonyme et la convertir ultérieurement en compte permanent. Toute votre progression est alors transférée.',
            'Vous devez fournir des renseignements d’inscription exacts et garder vos identifiants de connexion confidentiels.',
            'Vous devez être âgé d’au moins 16 ans (ou avoir l’âge minimal du consentement numérique dans votre pays) pour créer un compte permanent.',
            'Vous êtes responsable de tout ce qui se produit sous votre compte.',
            'Vous pouvez supprimer votre compte à tout moment depuis votre page Profil. La suppression est permanente et immédiate.',
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
            'Abuser du système de commentaires, contourner les limites de fréquence ou effectuer une extraction automatisée au-delà de ce que ferait un utilisateur normal.',
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
          En téléversant, en publiant ou en partageant quoi que ce soit sur Postr, vous{' '}
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
          utilisez — par exemple, l’enregistrement de vos brouillons, la génération
          d’aperçus, la remise de liens de partage aux personnes que vous invitez et
          l’affichage de vos affiches dans la galerie publique lorsque vous choisissez
          de les publier.
        </Body>
        <Body>
          Cette licence prend fin lorsque vous supprimez le contenu concerné ou votre
          compte, sauf (a) pour les copies que les caches techniques normaux et les
          sauvegardes conservent pendant une courte période, et (b) pour le contenu
          partagé que des tiers ont pu déjà consulter ou télécharger pendant qu’il était
          public.
        </Body>

        <SubHeading>5.3 La galerie publique — à lire attentivement</SubHeading>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">
            Tout ce que vous publiez dans la galerie est public.
          </strong>
          <br />
          Cela peut être vu par quiconque sur Internet, y compris par des personnes qui
          n’ont pas de compte Postr. Cela peut être indexé par les moteurs de
          recherche. Cela peut être mis en cache ou lié par des tiers que vous ne
          contrôlez pas. Réfléchissez avant de publier — surtout si l’affiche contient
          des résultats non publiés, des données sous embargo ou tout élément que vos
          collaborateurs ou votre établissement ne voudraient pas rendre public.
        </CalloutBox>
        <Body>
          En choisissant de publier une affiche (qu’elle ait été créée dans Postr ou
          qu’il s’agisse d’un PDF ou d’une image que vous avez téléversé), vous
          confirmez chacun des points suivants :
        </Body>
        <List
          items={[
            'Vous êtes le titulaire légitime des droits sur chaque élément de l’affiche — texte, figures, photos, logos, données — ou vous détenez l’autorisation écrite de chaque titulaire de droits pour les afficher publiquement.',
            'Tous les coauteurs nommés sur l’affiche ont consenti à son affichage public.',
            'Vous ne publiez pas de matériel confidentiel, sous embargo ou soumis à un contrôle des exportations.',
            'Vous retirerez l’affiche sans délai si l’un des points ci-dessus cesse d’être vrai.',
          ]}
        />
        <Body>
          Vous pouvez retirer (dépublier ou supprimer) toute affiche à tout moment
          depuis votre tableau de bord. Une fois retirée, elle ne sera plus diffusée par
          Postr, mais nous ne pouvons pas rappeler les copies que des tiers ont pu déjà
          faire.
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
        <Body>
          Vous acceptez de défendre, d’indemniser et de tenir Postr et son exploitant
          indemnes de toute réclamation, demande, perte, dommage, coût ou dépense (y
          compris les honoraires juridiques raisonnables) découlant de Votre contenu ou
          s’y rapportant — en particulier les réclamations selon lesquelles Votre
          contenu porte atteinte aux droits de propriété intellectuelle, au droit à la
          vie privée ou au droit à l’image d’un tiers. Dans la mesure où la loi
          applicable plafonne ou restreint cette indemnisation, celle-ci est limitée en
          conséquence.
        </Body>

        <SectionHeading n="6" title="Contenu et marques de commerce de Postr" />
        <Body>
          Le logiciel Postr, l’image de marque, le logo, la palette, les polices que
          nous fournissons et les modèles intégrés nous appartiennent (ou sont utilisés
          sous licence). Vous ne pouvez les utiliser que dans la mesure nécessaire pour
          exploiter et partager les affiches que vous créez sur Postr. Vous ne pouvez
          pas réutiliser nos éléments de marque pour d’autres produits ou services sans
          autorisation écrite.
        </Body>

        <SectionHeading n="7" title="Frais, abonnements et remboursements" />
        <Body>
          La création et la modification d’affiches, ainsi que l’exportation d’un PDF
          prêt à imprimer, sont gratuites. Certaines fonctionnalités sont payantes, en
          dollars canadiens (CAD) :
        </Body>
        <List
          items={[
            'Forfait à terme — CA$18.99 facturés tous les 4 mois. Un abonnement récurrent qui débloque l’exportation illimitée vers PowerPoint et LaTeX, sans filigrane. Il se renouvelle automatiquement tous les 4 mois jusqu’à ce que vous l’annuliez.',
            'Pack d’exportation — CA$9.99, une seule fois, pour 3 crédits d’exportation. Chaque exportation PowerPoint ou LaTeX utilise un crédit. Les crédits n’expirent jamais.',
          ]}
        />
        <Body>
          Les prix sont affichés au moment du paiement avant que vous ne payiez et
          peuvent changer de temps à autre; un changement de prix n’a jamais d’incidence
          sur un achat que vous avez déjà effectué. Les paiements sont traités par notre
          fournisseur de paiement, qui agit à titre de marchand attitré (merchant of
          record) et gère la facturation, les reçus et les taxes applicables.
        </Body>

        <SubHeading>7.1 Annulation de votre abonnement</SubHeading>
        <Body>
          Vous pouvez annuler le forfait à terme à tout moment — au moyen du lien « Gérer
          l’abonnement » sur votre page Profil. L’annulation met fin au prochain
          renouvellement; votre forfait demeure actif jusqu’à la fin de la période que
          vous avez déjà payée. L’annulation est sans frais et ne constitue pas un
          remboursement.
        </Body>

        <SubHeading id="refunds">7.2 Remboursements</SubHeading>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Forfait à terme — garantie de remboursement de 14 jours.</strong>
          <br />
          Si vous changez d’avis, nous rembourserons intégralement votre plus récente
          facturation de forfait dans les 14 jours suivant cette facturation, à
          condition que vous n’ayez pas effectué d’exportation PowerPoint ou LaTeX
          pendant cette période. Effectuer une exportation payante revient à utiliser le
          produit que vous avez payé, de sorte que la garantie prend fin à ce
          moment-là. Après 14 jours, ou une fois que vous avez exporté, cette
          facturation n’est pas remboursable — vous pouvez toujours annuler à tout
          moment pour interrompre les renouvellements futurs.
        </CalloutBox>
        <CalloutBox>
          <strong className="text-[#e2e2e8]">Pack d’exportation — les crédits non utilisés sont remboursables.</strong>
          <br />
          Si vous n’avez pas utilisé la totalité des crédits de votre pack, nous
          rembourserons la valeur des crédits que vous n’avez pas utilisés, au tarif de
          CA$3.33 par crédit (CA$9.99 ÷ 3). Le remboursement de vos crédits non
          utilisés les retire de votre compte. Les crédits utilisés ne sont pas
          remboursables.
        </CalloutBox>
        <Body>
          Vous pouvez demander un remboursement depuis la section Abonnement de votre
          page Profil, ou en écrivant à{' '}
          <a className="text-[#7c6aed] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . Les remboursements sont retournés sur votre mode de paiement d’origine et
          peuvent prendre quelques jours ouvrables avant d’apparaître.
        </Body>
        <Body>
          <strong className="text-[#c8cad0]">Si vous êtes dans l’UE, l’EEE ou au Royaume-Uni :</strong>{' '}
          vous disposez d’un droit légal de rétractation de 14 jours pour un achat à
          distance. Lorsque vous achetez une fonctionnalité payante, il vous est demandé
          de confirmer que vous voulez y accéder immédiatement et que vous comprenez que
          vous perdez ce droit de rétractation de 14 jours dès que vous effectuez une
          exportation payante (pour le forfait à terme) ou utilisez un crédit (pour le
          pack). Lorsque cette confirmation n’a pas été obtenue, votre droit légal de 14
          jours s’applique indépendamment de l’utilisation. Rien dans la présente
          section ne limite les droits de remboursement ou d’annulation dont vous
          disposez en vertu des lois impératives de protection des consommateurs de
          votre pays de résidence.
        </Body>

        <SectionHeading n="8" title="Commentaires" />
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
            'Vous pouvez cesser d’utiliser Postr à tout moment. Nous pouvons résilier votre compte en cas de manquement substantiel aux présentes Conditions ou d’inactivité prolongée d’une session d’invité anonyme.',
            'Les sections qui, de par leur nature, doivent survivre à la résiliation (par exemple, Vos garanties, l’indemnisation, les exclusions de garantie et la limitation de responsabilité) survivront.',
          ]}
        />

        <SectionHeading n="10" title="Exclusions de garantie" />
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
        <Body>
          Dans la mesure maximale permise par la loi applicable, Postr et son exploitant
          ne seront pas responsables des dommages indirects, accessoires, spéciaux,
          consécutifs ou punitifs, ni d’aucune perte de profits, de revenus, de données
          ou d’achalandage, découlant de votre utilisation du service ou s’y rapportant
          — que ce soit sur le fondement d’un contrat, d’un délit (y compris la
          négligence), d’une loi ou de toute autre théorie juridique, et que nous ayons
          été avisés ou non de la possibilité de tels dommages.
        </Body>
        <Body>
          Rien dans les présentes Conditions ne limite la responsabilité en cas de décès
          ou de préjudice corporel causé par notre négligence, de fraude ou de fausse
          déclaration frauduleuse, ni aucune autre responsabilité qui ne peut être
          limitée ou exclue en vertu de la loi applicable.
        </Body>

        <SectionHeading n="12" title="Droit applicable et différends" />
        <Body>
          Les présentes Conditions sont régies par les lois de la province de Québec et
          les lois fédérales du Canada qui y sont applicables, sans égard aux règles de
          conflit de lois. Tout différend découlant des présentes Conditions ou de votre
          utilisation de Postr sera porté exclusivement devant les tribunaux siégeant
          dans le district judiciaire de Montréal, au Québec, sauf lorsque les lois
          impératives de protection des consommateurs de votre pays de résidence vous
          confèrent le droit d’intenter des procédures localement.
        </Body>

        <SectionHeading n="13" title="Modifications des présentes Conditions" />
        <Body>
          Nous pouvons mettre à jour les présentes Conditions à mesure que le produit
          évolue ou que la loi change. La date de « Dernière mise à jour » en haut de la
          page reflète toujours la version en vigueur. Si une modification touche
          substantiellement vos droits, nous en informerons les utilisateurs connectés
          dans l’application ou par courriel avant qu’elle ne prenne effet. La poursuite
          de l’utilisation de Postr après la date d’entrée en vigueur signifie que vous
          acceptez les Conditions mises à jour.
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
