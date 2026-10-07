/**
 * The "Why poster sessions matter" page's copy (pages/WhyPosters.tsx),
 * English and French. Not a feature pitch: Postr appears once, at the
 * end. The French says what the English says, nothing more.
 */
import type { Bilingual } from './lang';

export interface Skill {
  readonly id: string;
  /** The transferable skill, named the way a CV would name it. */
  readonly title: string;
  /** What the poster session forces you to practise. */
  readonly atTheSession: string;
  /** Where the same skill shows up later. */
  readonly laterOn: string;
}

export interface Tip {
  readonly lead: string;
  readonly body: string;
}

const en = {
  eyebrow: 'Why poster sessions matter',
  titleLead: 'A poster is a deadline',
  titleAccent: 'that teaches you to explain.',
  intro:
    'Poster sessions have a reputation as the consolation prize of conference formats — what you get when your abstract does not make the talk list. That reading misses what the format is unusually good at. Standing next to your own work for a whole session, explaining it over and over to people who did not choose it, builds a set of skills that outlast the conference.',
  skills: [
    {
      id: 'compression',
      title: 'Explaining your work at three lengths',
      atTheSession:
        'A poster visit can be a glance or a long conversation, and you do not get to choose which. You end up with a one-line version, a two-minute version, and the full walkthrough, and you learn to read which one the person in front of you actually wants.',
      laterOn:
        'This is the same skill as a job talk, a grant summary, a thesis defence opening, and answering "so what do you do?" at a family dinner. A poster session lets you build it before you need it under pressure.',
    },
    {
      id: 'visual-argument',
      title: 'Making an argument visually',
      atTheSession:
        'A poster has no room for the paragraph that rescues a confusing figure. Either the layout carries the logic or the visitor gets lost. Deciding what becomes a figure, what becomes a sentence, and what gets cut entirely is editorial work, not decoration.',
      laterOn:
        'Slides, papers, and figures for review all reward the same judgement. So does any writing where a reader will skim before they commit — which is most writing that matters.',
    },
    {
      id: 'questions',
      title: 'Handling questions in real time',
      atTheSession:
        'Someone will ask about the confound you know is there. Someone else will misunderstand your design entirely. You practise answering both without defensiveness, and you find out which parts of your own reasoning you cannot yet articulate out loud.',
      laterOn:
        'Committee meetings, peer review, interviews, and collaborative disagreement all run on this. Saying "I do not know, and here is how I would find out" is a learned move, and a poster session is a low-stakes place to learn it.',
    },
    {
      id: 'audience',
      title: 'Reading an audience you did not choose',
      atTheSession:
        'The people who stop at your poster are not the people who read your paper. Some are experts in your method and not your question, some the reverse, some are undergraduates deciding what to study. You adjust vocabulary and depth on the fly.',
      laterOn:
        'Teaching, science communication, cross-disciplinary collaboration, and explaining technical work to non-technical stakeholders are the same problem wearing different clothes.',
    },
    {
      id: 'scoping',
      title: 'Deciding what the work is actually about',
      atTheSession:
        'You cannot fit the project on the board. Choosing the one claim the poster defends — and demoting everything else to "happy to talk about it" — forces a decision most people postpone until they write the paper.',
      laterOn:
        'A paper, a proposal, and a research programme all need the same framing decision. Making it early, on a deadline, with a physical size limit, is unusually good practice.',
    },
    {
      id: 'networking',
      title: 'Starting conversations without an introduction',
      atTheSession:
        'A poster gives you a legitimate reason to talk to people whose work you have only read, and gives them a reason to approach you. That is a rare structural advantage, and it disappears the moment the session ends.',
      laterOn:
        'Collaborations, postdoc positions, and reviewers who already know your name can all start in exactly these conversations.',
    },
  ] as readonly Skill[],
  laterOnHeading: 'Where it shows up again',
  tipsTitle: 'Getting the most out of one',
  tips: [
    {
      lead: 'Write the one-line version first.',
      body: 'If you cannot say what the poster claims in a sentence, the layout will not fix it.',
    },
    {
      lead: 'Rehearse out loud, standing up.',
      body: 'Reading your own poster silently hides every sentence you cannot actually say.',
    },
    {
      lead: 'Plan for the question you are dreading.',
      body: 'Someone will ask it. Having a real answer turns your weakest moment into a credible one.',
    },
    {
      lead: 'Leave room to point at things.',
      body: 'A poster you can gesture across is easier to explain than one packed edge to edge.',
    },
    {
      lead: 'Bring a way to stay in touch.',
      body: 'The conversation is the durable part, not the board.',
    },
  ] as readonly Tip[],
  closeTitle: 'When you are ready to build one',
  closeBody:
    'The skills above come from presenting, not from formatting. Postr exists so the formatting is not the hard part: real print sizes, authors and affiliations that stay in sync, and a figure text check you can run before you get to the print shop.',
  startPoster: 'Start a poster',
  seeHow: 'See how Postr works',
};

export type WhyPostersCopy = typeof en;

const fr: WhyPostersCopy = {
  eyebrow: 'Pourquoi les séances d’affiches comptent',
  titleLead: 'Une affiche est une échéance',
  titleAccent: 'qui vous apprend à expliquer.',
  intro:
    'Les séances d’affiches passent pour le prix de consolation des formats de congrès\u00a0: ce qu’on obtient quand son résumé n’est pas retenu pour une présentation orale. Cette lecture passe à côté de ce que le format fait remarquablement bien. Rester à côté de son propre travail pendant toute une séance, à l’expliquer encore et encore à des gens qui ne l’ont pas choisi, développe des compétences qui durent bien après le congrès.',
  skills: [
    {
      id: 'compression',
      title: 'Expliquer son travail en trois longueurs',
      atTheSession:
        'Une visite à votre affiche peut durer un coup d’œil ou une longue conversation, et ce n’est pas vous qui choisissez. Vous finissez par avoir une version en une phrase, une version de deux minutes et la présentation complète, et vous apprenez à reconnaître celle que la personne devant vous veut vraiment.',
      laterOn:
        'C’est la même compétence qu’une conférence de recrutement, un résumé de demande de subvention, l’ouverture d’une soutenance de thèse, ou la réponse à «\u00a0tu fais quoi, au juste?\u00a0» lors d’un souper de famille. Une séance d’affiches vous permet de la développer avant d’en avoir besoin sous pression.',
    },
    {
      id: 'visual-argument',
      title: 'Construire un argument visuel',
      atTheSession:
        'Une affiche n’a pas de place pour le paragraphe qui sauve une figure confuse. Soit la mise en page porte la logique, soit le visiteur se perd. Décider de ce qui devient une figure, de ce qui devient une phrase et de ce qui disparaît complètement est un travail éditorial, pas de la décoration.',
      laterOn:
        'Les diapositives, les articles et les figures soumises à une évaluation récompensent tous le même jugement. Tout comme n’importe quel texte qu’un lecteur survolera avant de s’y engager, c’est-à-dire la plupart des textes qui comptent.',
    },
    {
      id: 'questions',
      title: 'Répondre aux questions en temps réel',
      atTheSession:
        'Quelqu’un vous interrogera sur le facteur de confusion que vous savez présent. Quelqu’un d’autre comprendra entièrement de travers votre devis expérimental. Vous vous exercez à répondre aux deux sans vous mettre sur la défensive, et vous découvrez quelles parties de votre propre raisonnement vous ne savez pas encore formuler à voix haute.',
      laterOn:
        'Les réunions de comité, l’évaluation par les pairs, les entrevues et les désaccords entre collaborateurs reposent tous là-dessus. Dire «\u00a0je ne sais pas, et voici comment je le découvrirais\u00a0» s’apprend, et une séance d’affiches est un endroit sans grand enjeu pour l’apprendre.',
    },
    {
      id: 'audience',
      title: 'Lire un public que vous n’avez pas choisi',
      atTheSession:
        'Les gens qui s’arrêtent à votre affiche ne sont pas ceux qui lisent votre article. Certains sont experts de votre méthode mais pas de votre question, d’autres l’inverse, d’autres encore sont des étudiants au baccalauréat qui choisissent leur domaine. Vous ajustez le vocabulaire et la profondeur sur le moment.',
      laterOn:
        'L’enseignement, la vulgarisation scientifique, la collaboration interdisciplinaire et l’explication d’un travail technique à des interlocuteurs non techniques sont le même problème sous des habits différents.',
    },
    {
      id: 'scoping',
      title: 'Décider de quoi parle vraiment le travail',
      atTheSession:
        'Vous ne pouvez pas faire tenir le projet sur le panneau. Choisir la seule affirmation que l’affiche défend, et reléguer tout le reste au rang de «\u00a0j’en parlerais avec plaisir\u00a0», impose une décision que la plupart des gens repoussent jusqu’à la rédaction de l’article.',
      laterOn:
        'Un article, une demande de financement et un programme de recherche exigent tous la même décision de cadrage. La prendre tôt, avec une échéance et une limite de taille physique, est un exercice remarquablement utile.',
    },
    {
      id: 'networking',
      title: 'Entamer des conversations sans présentation',
      atTheSession:
        'Une affiche vous donne une raison légitime de parler à des gens dont vous avez seulement lu les travaux, et leur donne une raison de venir vers vous. C’est un avantage structurel rare, et il disparaît à la fin de la séance.',
      laterOn:
        'Des collaborations, des postes postdoctoraux et des évaluateurs qui connaissent déjà votre nom peuvent tous naître précisément de ces conversations.',
    },
  ],
  laterOnHeading: 'Où on la retrouve',
  tipsTitle: 'En tirer le meilleur parti',
  tips: [
    {
      lead: 'Écrivez d’abord la version en une phrase.',
      body: 'Si vous ne pouvez pas dire en une phrase ce que l’affiche affirme, la mise en page ne réglera pas le problème.',
    },
    {
      lead: 'Répétez à voix haute, debout.',
      body: 'Relire votre affiche en silence cache chaque phrase que vous ne savez pas vraiment dire.',
    },
    {
      lead: 'Préparez la question que vous redoutez.',
      body: 'Quelqu’un la posera. Avoir une vraie réponse transforme votre moment le plus faible en moment crédible.',
    },
    {
      lead: 'Laissez de la place pour pointer.',
      body: 'Une affiche qui laisse de la place aux gestes est plus facile à expliquer qu’une affiche remplie d’un bord à l’autre.',
    },
    {
      lead: 'Prévoyez un moyen de rester en contact.',
      body: 'C’est la conversation qui dure, pas le panneau.',
    },
  ],
  closeTitle: 'Quand vous serez prêt à en créer une',
  closeBody:
    'Les compétences ci-dessus viennent du fait de présenter, pas de la mise en forme. Postr existe pour que la mise en forme ne soit pas la partie difficile\u00a0: de vraies tailles d’impression, des auteurs et des affiliations qui restent synchronisés, et une vérification du texte des figures que vous pouvez lancer avant d’aller chez l’imprimeur.',
  startPoster: 'Commencer une affiche',
  seeHow: 'Voir comment fonctionne Postr',
};

export const WHY_POSTERS_COPY: Bilingual<WhyPostersCopy> = { en, fr };
