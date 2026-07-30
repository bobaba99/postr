/**
 * Review (Presentation Checker) model configuration — the ONLY place the
 * review model identifier lives (Global Constraints: "model id isolated
 * in apps/api/src/review/config.ts"). A model swap edits this file,
 * never critique.ts or a route.
 */

/**
 * The same model import.ts already uses for vision extraction, isolated
 * here per spec §2 (Model). Sonnet 4.5 carries the two-stage
 * perceive→judge pass over up to REVIEW_MAX_PAGES page images.
 */
export const REVIEW_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Output ceiling: the prompt asks for 4–10 findings ×
 * (problem + fix + personalized example) ≈ 2–4K tokens; 8192 leaves
 * headroom for multi-page decks without letting a runaway reply bill
 * (the import.ts:916-920 16K rationale, scaled to a smaller schema).
 */
export const REVIEW_MAX_TOKENS = 8192;

/** Hard page cap (spec §1) — over → typed error, never silent truncation. */
export const REVIEW_MAX_PAGES = 24;

/** Per-page network deadline; 24 sequential pages are bounded to six minutes. */
export const REVIEW_PAGE_FETCH_TIMEOUT_MS = 15_000;

/** Provider deadline; retries are disabled so the claim lease cannot be overrun. */
export const REVIEW_PROVIDER_TIMEOUT_MS = 120_000;

/**
 * Mirrors the SQL claim lease. Worst-case page fetch + provider work is
 * 24×15s + 120s = 8 minutes, strictly below this ten-minute lease.
 */
export const REVIEW_INITIAL_CLAIM_LEASE_MS = 10 * 60 * 1000;

/**
 * Per-page raw-byte cap, checked BEFORE base64 (which inflates 4/3) so the
 * caller gets a clean typed error instead of an opaque upstream rejection
 * (import.ts:544-551 precedent). Injectable in fetchReviewPages for tests.
 */
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Aggregate raw-image budget for one critique request. This is checked while
 * streaming, before base64 expansion, so a valid 24-page request cannot make
 * the API retain 24 independently max-sized objects.
 */
export const REVIEW_TOTAL_IMAGE_MAX_BYTES = 40 * 1024 * 1024;

/** PPTX upload cap for the /api/review/render-pptx route (D10). */
export const REVIEW_PPTX_MAX_BYTES = 50 * 1024 * 1024;

/** Maximum declared expansion of all ZIP entries before conversion. */
export const REVIEW_PPTX_MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;

/** Maximum declared expansion ratio for any ZIP entry or the archive total. */
export const REVIEW_PPTX_MAX_COMPRESSION_RATIO = 100;

/** Reject excess LibreOffice work instead of queueing unbounded conversions. */
export const REVIEW_PPTX_MAX_CONCURRENT_RENDERS = 1;

/**
 * Deadline for each Storage upload, signed-URL mint, and rollback call made
 * while the process-global PPTX work lease is held.
 */
export const REVIEW_PPTX_STORAGE_TIMEOUT_MS = 15_000;

/** Maximum encoded bytes retained for one JPEG emitted by pdftoppm. */
export const REVIEW_PPTX_RENDERED_PAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Maximum encoded bytes retained across all rendered page JPEGs. */
export const REVIEW_PPTX_RENDERED_TOTAL_MAX_BYTES = 48 * 1024 * 1024;

/**
 * Vision-resolution ceiling for every rendered slide. pdftoppm is asked to
 * fit pages inside this box and the post-render check fails closed if the
 * converter ever emits a larger image.
 */
export const REVIEW_PPTX_RENDERED_MAX_DIMENSION_PX = 2048;

/** Maximum decoded pixel area accepted from a rendered page JPEG. */
export const REVIEW_PPTX_RENDERED_MAX_PIXELS = 40_000_000;

/**
 * Hard findings clamp applied by enforce.ts (Task 14). The prompt asks
 * for 4–10; this is the deterministic ceiling beyond that ask.
 */
export const REVIEW_MAX_FINDINGS = 12;

/**
 * Weekly add-on quota (D5) — placeholder, repriced from Phase-0 numbers;
 * the final value is set from day-one cost instrumentation (Task 28).
 */
export const REVIEW_ADDON_WEEKLY_QUOTA = 4;

/** Signed-URL TTL (seconds) for review page images (D11). */
export const REVIEW_SIGNED_URL_TTL_SEC = 600;
