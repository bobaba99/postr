/**
 * 10 psychology research papers (working-memory training topic) sourced
 * from Consensus search on 2026-04-27. Each one drives one synthetic
 * HTML poster used by the import-pipeline benchmark.
 *
 * Diversity matters more than topical breadth here — the benchmark
 * exercises the IMPORTER (text clustering, figure extraction, logo
 * detection, decoration filtering), not domain knowledge. The papers
 * differ in author count, methodology, sample size, and result
 * complexity — enough variation to stress different code paths.
 */

export interface Paper {
  /** Short ID used as the filename stem. */
  id: string;
  title: string;
  authors: string[];
  /** First-author affiliation only; templates synthesize plausible
   *  multi-affiliation layouts when needed. */
  affiliation: string;
  year: number;
  journal: string;
  citations: number;
  abstract: string;
  /** Numeric facts the templates can scatter into "Results" sections
   *  for plausibility (sample sizes, effect sizes, p-values). */
  facts: string[];
  /** What kind of poster layout this paper would plausibly produce —
   *  drives template selection. */
  posterStyle: 'data-heavy' | 'methods-heavy' | 'review' | 'minimal';
}

export const PAPERS: Paper[] = [
  {
    id: 'matysiak-2019',
    title:
      'Working Memory Capacity as a Predictor of Cognitive Training Efficacy in the Elderly Population',
    authors: ['Olga Matysiak', 'Anna Kroemeke', 'Aneta Brzezicka'],
    affiliation: 'SWPS University, Warsaw',
    year: 2019,
    journal: 'Frontiers in Aging Neuroscience',
    citations: 62,
    abstract:
      'We investigated the impact of WM training on variety of cognitive tasks performance among older adults and the impact of the initial WM capacity (WMC) on the training efficiency. 85 healthy older adults received 5 weeks of training on adaptive dual N-back task or memory quiz.',
    facts: [
      'N = 85 (55 F / 30 M)',
      'Age: 55–81 years',
      '5 weeks adaptive dual N-back training',
      'Initial WMC moderated training gains (β = 0.31, p < .01)',
    ],
    posterStyle: 'data-heavy',
  },
  {
    id: 'constantinidis-2016',
    title: 'The Neuroscience of Working Memory Capacity and Training',
    authors: ['Christos Constantinidis', 'Torkel Klingberg'],
    affiliation: 'Wake Forest School of Medicine',
    year: 2016,
    journal: 'Nature Reviews Neuroscience',
    citations: 454,
    abstract:
      'Training increases the activity of prefrontal neurons and the strength of connectivity in the prefrontal cortex and between the prefrontal and parietal cortex. Dopaminergic transmission could have a facilitatory role.',
    facts: [
      'Reviewed 47 imaging + electrophysiology studies',
      'PFC activity ↑ 12–35% post-training',
      'Frontoparietal connectivity ↑ in 8/9 fMRI studies',
      'D1 receptor density implicated as facilitator',
    ],
    posterStyle: 'review',
  },
  {
    id: 'klingberg-2010',
    title: 'Training and Plasticity of Working Memory',
    authors: ['Torkel Klingberg'],
    affiliation: 'Karolinska Institute, Stockholm',
    year: 2010,
    journal: 'Trends in Cognitive Sciences',
    citations: 1602,
    abstract:
      'WM capacity, viewed as a constant trait, can be improved by adaptive and extended training. Training is associated with changes in brain activity in frontal and parietal cortex and basal ganglia.',
    facts: [
      'Adaptive training > non-adaptive (g = 0.62)',
      'Transfer to non-trained WM tasks: g = 0.41',
      'Effect persists at 6-month follow-up in 4/7 studies',
    ],
    posterStyle: 'methods-heavy',
  },
  {
    id: 'shipstead-2012',
    title: 'Is Working Memory Training Effective?',
    authors: ['Zach Shipstead', 'Thomas S. Redick', 'Randall W. Engle'],
    affiliation: 'Georgia Institute of Technology',
    year: 2012,
    journal: 'Psychological Bulletin',
    citations: 1137,
    abstract:
      'We review WM training research in light of several methodological concerns: single-task definitions of change, inconsistent task validity, no-contact controls, and subjective measurement.',
    facts: [
      '76 studies reviewed; 23 met inclusion criteria',
      'Active-control comparison: g = 0.18 (vs g = 0.45 no-contact)',
      'Far-transfer to fluid intelligence: not reliably demonstrated',
    ],
    posterStyle: 'review',
  },
  {
    id: 'rodas-2024',
    title:
      'Can We Enhance Working Memory? Bias and Effectiveness in Cognitive Training Studies',
    authors: ['José A. Rodas', 'Ciara M. Greene'],
    affiliation: 'University College Dublin',
    year: 2024,
    journal: 'Psychonomic Bulletin & Review',
    citations: 9,
    abstract:
      'We performed a risk of bias assessment of the included studies and took special care in controlling for practice effects. Data from 52 independent comparisons were analyzed.',
    facts: [
      '52 independent comparisons',
      'WM gain SMD = 0.18 across all assessments',
      'SMD = 1.15 when assessment task ≈ training task',
      'Fluid intelligence: no improvement',
    ],
    posterStyle: 'data-heavy',
  },
  {
    id: 'morrison-2011',
    title:
      'Does Working Memory Training Work? The Promise and Challenges of Enhancing Cognition by Training Working Memory',
    authors: ['Alexandra B. Morrison', 'Jason M. Chein'],
    affiliation: 'Temple University, Philadelphia',
    year: 2011,
    journal: 'Psychonomic Bulletin & Review',
    citations: 766,
    abstract:
      'We identify two distinct approaches to WM training, strategy training and core training, and detail their theoretical and practical motivations.',
    facts: [
      'Strategy training transfer: limited to trained strategy',
      'Core training transfer: broader, target domain-general WM',
      'N-back paradigm dominates core-training literature',
    ],
    posterStyle: 'methods-heavy',
  },
  {
    id: 'sala-2017',
    title:
      'Working Memory Training in Typically Developing Children: A Meta-Analysis of the Available Evidence',
    authors: ['Giovanni Sala', 'Fernand Gobet'],
    affiliation: 'University of Liverpool',
    year: 2017,
    journal: 'Developmental Psychology',
    citations: 183,
    abstract:
      'We focused on the effects of WM training on cognitive and academic skills in typically developing children aged 3–16. WM-related skills improved (g = 0.46) but far-transfer effects were minimal (g = 0.12).',
    facts: [
      'Children aged 3–16; 41 studies',
      'Near-transfer (WM tasks): g = 0.46',
      'Far-transfer (math, literacy): g = 0.12',
      'Effect inversely related to study quality',
    ],
    posterStyle: 'data-heavy',
  },
  {
    id: 'bastian-2013',
    title: 'Effects and Mechanisms of Working Memory Training: A Review',
    authors: ['Claudia C. von Bastian', 'Klaus Oberauer'],
    affiliation: 'University of Zurich',
    year: 2013,
    journal: 'Psychological Research',
    citations: 290,
    abstract:
      'We propose two mechanisms mediating training transfer effects: enhanced WM capacity itself, or enhanced efficiency in using available capacity (e.g., chunking strategies).',
    facts: [
      'Two-mechanism model: capacity vs efficiency',
      'Training intensity moderates capacity gain',
      'Individual differences in age, motivation, baseline ability',
    ],
    posterStyle: 'review',
  },
  {
    id: 'sala-2019',
    title:
      'Working Memory Training Does Not Enhance Older Adults Cognitive Skills: A Comprehensive Meta-Analysis',
    authors: ['Giovanni Sala', 'N. Deniz Aksayli', 'K. Semir Tatlıdil', 'Fernand Gobet'],
    affiliation: 'Fujita Health University',
    year: 2019,
    journal: 'Intelligence',
    citations: 43,
    abstract:
      'Three robust-variance-estimation meta-analyses (N = 2140, m = 43) examined effects on trained tasks, near-transfer, and far-transfer measures in older adults.',
    facts: [
      'N = 2140 across 43 studies',
      'Trained tasks: g = 0.877',
      'Near-transfer: g = 0.274',
      'Far-transfer: g = 0.121 (null with active controls)',
    ],
    posterStyle: 'data-heavy',
  },
  {
    id: 'melby-lervaag-2013',
    title: 'Is Working Memory Training Effective? A Meta-Analytic Review',
    authors: ['Monica Melby-Lervåg', 'Charles Hulme'],
    affiliation: 'University of Oslo',
    year: 2013,
    journal: 'Developmental Psychology',
    citations: 1706,
    abstract:
      'Meta-analyses indicate WM training programs produce reliable short-term improvements in WM skills. Verbal WM near-transfer effects do not sustain at follow-up; visuospatial may persist.',
    facts: [
      '23 studies; 30 group comparisons',
      'Verbal WM short-term: d = 0.79',
      'Visuospatial WM short-term: d = 0.52',
      'Verbal WM at follow-up: d = 0.12 (n.s.)',
    ],
    posterStyle: 'minimal',
  },
];
