/**
 * The current rubric pointer. A v2 rubric lands as `v2.ts` beside `v1.ts`;
 * this file switches CURRENT_RUBRIC to it. Historical reviews stay pinned
 * to their stamped `source_meta.rubric_version`.
 */
export { RUBRIC_V1 as CURRENT_RUBRIC, RUBRIC_VERSION as CURRENT_RUBRIC_VERSION } from './v1.js';
export type {
  IssueCategory,
  ReviewDimension,
  RubricRule,
  DimensionDefinition,
  Rubric,
} from './v1.js';
export { ISSUE_CATEGORIES, PERCEPTION_RULES, ECONOMY_RULES, DIMENSIONS } from './v1.js';
