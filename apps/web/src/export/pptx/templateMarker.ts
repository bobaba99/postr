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
 * How many `TEMPLATE_SLIDE_PREFIX`-named slides a single export can
 * legitimately append: the explainer + one empty slide per named
 * layout (`templateSlides.ts`, 6) plus the two Phase-2 styled-deck
 * utility slides — the palette swatch slide (`paletteSlide.ts`) and
 * the icon-library slide (`iconLibrarySlide.ts`), appended together by
 * the styled-deck pptx export path (`SlidesWizard.tsx`'s
 * `handleExportPptx`, Task 10).
 *
 * The importer uses it as a CAP on how many slides it will treat as
 * ours, so a deck full of forged names cannot claim that nothing was
 * skipped (see `parsePptx.ts`). It must stay ≥ the true maximum a
 * single export can produce across EVERY utility-slide source in the
 * codebase, even sources not wired into today's export path — a
 * future caller combining `addTemplateSlides` with the styled-deck
 * utility slides in one file must not silently under-count. Bump this
 * again if a new utility-slide appender is added anywhere.
 */
export const APPENDED_SLIDE_COUNT = 8;
