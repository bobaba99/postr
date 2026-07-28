/**
 * The marker that tells Postr's own appended slides apart from a
 * user's real content.
 *
 * Its own module on purpose. The EXPORTER stamps it (see
 * `templateSlides.ts`); the IMPORTER reads it (see
 * `import/pptx/parsePptx.ts`) to avoid warning that six slides were
 * "skipped" when re-importing a file Postr itself produced. Keeping
 * the constant here means the importer does not pull the whole layout
 * builder — pptxgenjs types, palettes, geometry — in behind it.
 *
 * ASCII only and free of XML metacharacters on purpose: pptxgenjs
 * interpolates the slide name straight into `<p:cSld name="…">` with
 * NO escaping, exactly as it does with font names.
 */
export const TEMPLATE_SLIDE_PREFIX = 'Postr template - ';

/**
 * How many slides the exporter appends after the poster: the
 * explainer, plus one empty slide per named layout.
 *
 * The importer uses it as a CAP on how many slides it will treat as
 * ours, so a deck full of forged names cannot claim that nothing was
 * skipped. `templateSlides.ts` asserts this matches the layout list it
 * actually writes.
 */
export const APPENDED_SLIDE_COUNT = 6;
