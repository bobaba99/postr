/**
 * WhyPosters — the "what a poster session actually teaches you" page.
 *
 * Sits under the footer's Learn column alongside About. Where About is
 * a feature tour, this page is about the *activity*: what presenting a
 * poster does for the person presenting it, and which of those skills
 * keep paying off after the conference badge comes off.
 *
 * Deliberately not a feature pitch. Postr appears once, at the end, as
 * a way to act on the advice — naming the workflow, never a capability
 * claim. Nothing here asserts an outcome the product delivers.
 */
import { Link } from 'react-router';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { STATIC_ROUTE_META } from '@/seo/siteMeta';
import { useDocumentMeta } from '@/seo/useDocumentMeta';

interface Skill {
  id: string;
  /** The transferable skill, named the way a CV would name it. */
  title: string;
  /** What the poster session forces you to practise. */
  atTheSession: string;
  /** Where the same skill shows up later. */
  laterOn: string;
}

const SKILLS: Skill[] = [
  {
    id: 'compression',
    title: 'Explaining your work at three lengths',
    atTheSession:
      'A poster visit lasts anywhere from twenty seconds to twenty minutes, and you do not get to choose which. You end up with a one-line version, a two-minute version, and the full walkthrough — and you learn to read which one the person in front of you actually wants.',
    laterOn:
      'This is the same skill as a job talk, a grant summary, a thesis defence opening, and answering "so what do you do?" at a family dinner. Most researchers build it by accident at poster sessions before they ever need it under pressure.',
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
      'Framing is the hardest part of a paper, a proposal, and a research programme. Doing it early, on a deadline, with a physical size limit, is unusually good practice.',
  },
  {
    id: 'networking',
    title: 'Starting conversations without an introduction',
    atTheSession:
      'A poster gives you a legitimate reason to talk to people whose work you have only read, and gives them a reason to approach you. That is a rare structural advantage, and it disappears the moment the session ends.',
    laterOn:
      'Collaborations, postdoc positions, and reviewers who already know your name tend to originate in exactly these conversations rather than in cold email.',
  },
];

export default function WhyPosters() {
  useDocumentMeta(STATIC_ROUTE_META['/why-posters'] ?? null);

  return (
    <main className="flex min-h-screen w-screen flex-col bg-[#0a0a12] text-[#c8cad0]">
      <PublicHeader />

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-8 pb-12 pt-20 text-center">
        <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#7c6aed]">
          Why poster sessions matter
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
          A poster is a deadline
          <br />
          <span className="text-[#7c6aed]">that teaches you to explain.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[14pt] leading-relaxed text-[#9ca3af]">
          Poster sessions have a reputation as the consolation prize of
          conference formats — what you get when your abstract does not make the
          talk list. That reading misses what the format is unusually good at.
          Standing next to your own work for two hours, explaining it over and
          over to people who did not choose it, builds a set of skills that
          outlast the conference.
        </p>
      </section>

      {/* Skills */}
      <section className="mx-auto w-full max-w-4xl px-8 pb-8">
        <ul className="flex list-none flex-col gap-6 p-0">
          {SKILLS.map((skill, i) => (
            <li
              key={skill.id}
              className="rounded-2xl border border-[#2a2a3a] bg-[#111118] p-8"
            >
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-[11px] font-semibold tabular-nums tracking-[0.2em] text-[#7c6aed]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  {skill.title}
                </h2>
              </div>
              <p className="text-[13pt] leading-relaxed text-[#9ca3af]">
                {skill.atTheSession}
              </p>
              <p className="mt-4 border-l-2 border-[#2a2a3a] pl-4 text-[12pt] leading-relaxed text-[#6b7280]">
                <span className="font-semibold uppercase tracking-[0.15em] text-[#7c6aed]">
                  Where it shows up again
                </span>
                <br />
                {skill.laterOn}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Practical note */}
      <section className="mx-auto w-full max-w-3xl px-8 py-12">
        <div className="rounded-2xl border border-[#2a2a3a] bg-[#0f0f18] p-8">
          <h2 className="mb-4 text-2xl font-bold text-white">
            Getting the most out of one
          </h2>
          <ul className="flex list-none flex-col gap-3 p-0 text-[13pt] leading-relaxed text-[#9ca3af]">
            <li>
              <strong className="text-[#c8cad0]">
                Write the one-line version first.
              </strong>{' '}
              If you cannot say what the poster claims in a sentence, the layout
              will not fix it.
            </li>
            <li>
              <strong className="text-[#c8cad0]">
                Rehearse out loud, standing up.
              </strong>{' '}
              Reading your own poster silently hides every sentence you cannot
              actually say.
            </li>
            <li>
              <strong className="text-[#c8cad0]">
                Plan for the question you are dreading.
              </strong>{' '}
              Someone will ask it. Having a real answer turns your weakest
              moment into a credible one.
            </li>
            <li>
              <strong className="text-[#c8cad0]">
                Leave room to point at things.
              </strong>{' '}
              A poster you can gesture across is easier to explain than one
              packed edge to edge.
            </li>
            <li>
              <strong className="text-[#c8cad0]">
                Bring a way to stay in touch.
              </strong>{' '}
              The conversation is the durable part, not the board.
            </li>
          </ul>
        </div>
      </section>

      {/* Close */}
      <section className="mx-auto w-full max-w-3xl flex-1 px-8 pb-24">
        <div className="rounded-2xl border border-[#2a2a3a] bg-[#111118] p-10">
          <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">
            When you are ready to build one
          </h2>
          <p className="mb-6 text-[13pt] leading-relaxed text-[#9ca3af]">
            The skills above come from presenting, not from formatting. Postr
            exists so the formatting takes an afternoon instead of a week — real
            print sizes, authors and affiliations that stay in sync, and figures
            checked for legibility before you get to the print shop.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/"
              className="rounded-md bg-[#7c6aed] px-5 py-2.5 text-[14pt] font-semibold text-white no-underline hover:bg-[#6b5adc]"
            >
              Start a poster
            </Link>
            <Link
              to="/about"
              className="rounded-md border border-[#2a2a3a] px-5 py-2.5 text-[14pt] font-semibold text-[#c8cad0] no-underline hover:border-[#7c6aed] hover:text-white"
            >
              See how Postr works
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
