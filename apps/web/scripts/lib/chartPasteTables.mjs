/**
 * Tables a researcher pastes into "Paste your table" (Insert › Chart), for
 * scripts/chart-print-size-check.mjs: the partition fix 13c's review round 1
 * measured its findings Q-R1 to Q-R4 on (record
 * docs/fixes/13c-chart-text-minimums.md, section 9), folded in so the gates
 * hold on it. Not the chooser's sample sets: long mixed-case and upper-case
 * category names, ten long-named series, values in the millions, long column
 * names (axis titles), a Likert set with long statements, a paired set with
 * long participant labels. Names are made up (bogus institutions only).
 */
const tsv = (header, rows) => [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');

const LONG_CATS = [
  'Cognitive behavioural therapy plus medication',
  'Mindfulness-based stress reduction (8 weeks)',
  'Treatment as usual in primary care',
  'Waitlist control with weekly check-ins',
  'Peer support group led by trained volunteers',
  'Online self-help programme',
];
const UPPER_CATS = [
  'MINDFULNESS-BASED STRESS REDUCTION',
  'COGNITIVE BEHAVIOURAL THERAPY',
  'TREATMENT AS USUAL',
  'WAITLIST CONTROL',
  'HIGH-DOSE MEMANTINE',
];
const ARMS = [
  'Placebo plus standard care (n = 40)',
  'Low-dose ketamine infusion (n = 38)',
  'Medium-dose ketamine infusion (n = 41)',
  'High-dose ketamine infusion (n = 37)',
  'Active comparator: midazolam (n = 39)',
  'Electroconvulsive therapy reference arm',
  'Open-label extension cohort A',
  'Open-label extension cohort B',
  'Sham stimulation control',
  'Healthy volunteers (reference)',
];

export const PASTE_TABLES = {
  // A category with long mixed-case names, step counts in thousands.
  longcats: tsv(['Intervention', 'Participant ID', 'Mean daily step count during the final study week'],
    LONG_CATS.flatMap((c, i) => Array.from({ length: 6 }, (_, j) => [c, `P${i}${j}`, String(4500 + i * 1530 + j * 211)]))),
  // Upper-case labels, wider than a 0.6 em estimate in any poster font.
  uppercats: tsv(['CONDITION', 'SCORE ON THE HAMILTON DEPRESSION RATING SCALE'],
    UPPER_CATS.flatMap((c, i) => Array.from({ length: 5 }, (_, j) => [c, String(12 + i * 2 + j)]))),
  // Ten long-named arms over four visits.
  manyseries: tsv(['Visit', 'Treatment arm', 'Montgomery–Åsberg Depression Rating Scale total'],
    ['Baseline', 'Week 4', 'Week 8', 'Week 12'].flatMap((v, i) => ARMS.map((a, j) => [v, a, String(34 - i * (1 + j * 0.5) + j)]))),
  // Values in the millions, a numeric year axis, three long-named series.
  millions: tsv(['Year', 'Funding source', 'Total research funding awarded (Canadian dollars)'],
    Array.from({ length: 10 }, (_, i) => 2015 + i).flatMap((y, i) => [
      ['Federal granting councils (CIHR, NSERC, SSHRC)', 1250000 + i * 410000],
      ['Provincial health research agencies', 980000 + i * 230000],
      ['Private foundations and industry partners', 2400000 + i * 760000],
    ].map(([s, v]) => [String(y), s, String(v)]))),
  // Two measures with long names and four-digit values.
  scatter: tsv(['Total salivary cortisol output over the waking day (nmol/L x min)', 'Total sleep time in the week before sampling (minutes)'],
    Array.from({ length: 40 }, (_, i) => [String(1800 + ((i * 37) % 23) * 61), String(2100 + ((i * 53) % 29) * 37)])),
  // Likert: long statements.
  likert: tsv(['Statement', 'Response', 'Count'],
    ['I felt comfortable asking questions during the poster session',
      'The figures on the poster were readable from two metres away',
      'The methods section explained the study design clearly enough to follow',
      'I would recommend this format for future departmental research days'].flatMap((st, i) =>
      ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'].map((r, j) => [st, r, String(3 + ((i + j * 3) % 7) * 4)]))),
  // Four upper-case long-named series: the legend's labels.
  upperseries: tsv(['VISIT', 'STUDY ARM', 'MEAN SCORE'],
    ['BASELINE', 'WEEK 4', 'WEEK 8'].flatMap((v, i) => ['PLACEBO PLUS STANDARD CARE (N = 40)', 'LOW-DOSE KETAMINE INFUSION (N = 38)', 'HIGH-DOSE KETAMINE INFUSION (N = 37)', 'ACTIVE COMPARATOR: MIDAZOLAM (N = 39)'].map((a, j) => [v, a, String(30 - i * (2 + j) + j)]))),
  // Paired before/after with long participant labels.
  paired: tsv(['Participant', 'Systolic blood pressure before the intervention (mmHg)', 'Systolic blood pressure after the intervention (mmHg)'],
    Array.from({ length: 8 }, (_, i) => [`Participant ${String(i + 1).padStart(2, '0')} (Acme State University site)`, String(150 - i * 3), String(138 - i * 2)])),
};

/** Appended to a caption in the long-caption scenario (the review's). */
export const LONG_CAPTION_TAIL = ' Error bars show 95% confidence intervals computed by a nonparametric bootstrap with 2,000 resamples; participants who withdrew before the final visit are excluded from every panel of this figure.';
