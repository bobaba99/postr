/**
 * Logo presets — curated North American university catalog.
 *
 * Each preset stores `{ id, name, domain, wiki, region, location }`.
 * At click time the LogoPicker first asks Wikipedia's REST API
 * for the institution's page image (its seal / coat of arms /
 * crest — far more accurate than a 16×16 favicon), and only
 * falls back to Google's s2 favicon service if Wikipedia has
 * no image or the fetch fails.
 *
 * Wikipedia lookup (`fetchWikiLogoUrl` below):
 *
 *   GET https://en.wikipedia.org/api/rest_v1/page/summary/{wiki}
 *   → JSON with `originalimage.source` — usually a full-size
 *     SVG/PNG of the page's infobox image, which for
 *     universities is their official seal or crest.
 *
 * This lookup is CORS-enabled by Wikipedia, free, and reflects
 * updates to the Wikipedia article without redeploys. The
 * tradeoff is that the URL is REMOTE (not base64) so the block
 * re-fetches at every render; exports via html-to-image may
 * skip the image if cross-origin cloning fails. Users are
 * nudged to upload their own high-res file from the Upload tab
 * before print.
 *
 * The `wiki` field is the Wikipedia page title with underscores
 * (URL form): e.g. "Harvard_University", "Massachusetts_Institute_of_Technology".
 *
 * Coverage: ~80 North American universities biased toward the
 * institutions most likely to produce posters (R1 research, top
 * medical/engineering schools, national flagships). PRs welcome.
 */

export interface LogoPreset {
  /** Stable id used in URLs and saved presets */
  id: string;
  /** Display name shown in the picker */
  name: string;
  /**
   * Wikipedia page title (URL form — underscores for spaces).
   * Used to resolve an accurate crest / seal via the Wikipedia
   * REST API at click time.
   */
  wiki: string;
  /** Domain used as a fallback favicon source */
  domain: string;
  /** Region for filter buttons + rough grouping */
  region: 'us-ne' | 'us-s' | 'us-mw' | 'us-w' | 'canada';
  /** City / state hint for the search result card */
  location: string;
}

export const LOGO_PRESETS: readonly LogoPreset[] = [
  // ─── US Northeast ────────────────────────────────────────────
  { id: 'harvard', name: 'Harvard University', wiki: 'Harvard_University', domain: 'harvard.edu', region: 'us-ne', location: 'Cambridge, MA' },
  { id: 'mit', name: 'Massachusetts Institute of Technology', wiki: 'Massachusetts_Institute_of_Technology', domain: 'mit.edu', region: 'us-ne', location: 'Cambridge, MA' },
  { id: 'yale', name: 'Yale University', wiki: 'Yale_University', domain: 'yale.edu', region: 'us-ne', location: 'New Haven, CT' },
  { id: 'princeton', name: 'Princeton University', wiki: 'Princeton_University', domain: 'princeton.edu', region: 'us-ne', location: 'Princeton, NJ' },
  { id: 'columbia', name: 'Columbia University', wiki: 'Columbia_University', domain: 'columbia.edu', region: 'us-ne', location: 'New York, NY' },
  { id: 'upenn', name: 'University of Pennsylvania', wiki: 'University_of_Pennsylvania', domain: 'upenn.edu', region: 'us-ne', location: 'Philadelphia, PA' },
  { id: 'cornell', name: 'Cornell University', wiki: 'Cornell_University', domain: 'cornell.edu', region: 'us-ne', location: 'Ithaca, NY' },
  { id: 'brown', name: 'Brown University', wiki: 'Brown_University', domain: 'brown.edu', region: 'us-ne', location: 'Providence, RI' },
  { id: 'dartmouth', name: 'Dartmouth College', wiki: 'Dartmouth_College', domain: 'dartmouth.edu', region: 'us-ne', location: 'Hanover, NH' },
  { id: 'nyu', name: 'New York University', wiki: 'New_York_University', domain: 'nyu.edu', region: 'us-ne', location: 'New York, NY' },
  { id: 'jhu', name: 'Johns Hopkins University', wiki: 'Johns_Hopkins_University', domain: 'jhu.edu', region: 'us-ne', location: 'Baltimore, MD' },
  { id: 'bu', name: 'Boston University', wiki: 'Boston_University', domain: 'bu.edu', region: 'us-ne', location: 'Boston, MA' },
  { id: 'bc', name: 'Boston College', wiki: 'Boston_College', domain: 'bc.edu', region: 'us-ne', location: 'Chestnut Hill, MA' },
  { id: 'tufts', name: 'Tufts University', wiki: 'Tufts_University', domain: 'tufts.edu', region: 'us-ne', location: 'Medford, MA' },
  { id: 'northeastern', name: 'Northeastern University', wiki: 'Northeastern_University', domain: 'northeastern.edu', region: 'us-ne', location: 'Boston, MA' },
  { id: 'umd', name: 'University of Maryland', wiki: 'University_of_Maryland,_College_Park', domain: 'umd.edu', region: 'us-ne', location: 'College Park, MD' },
  { id: 'pitt', name: 'University of Pittsburgh', wiki: 'University_of_Pittsburgh', domain: 'pitt.edu', region: 'us-ne', location: 'Pittsburgh, PA' },
  { id: 'psu', name: 'Penn State University', wiki: 'Pennsylvania_State_University', domain: 'psu.edu', region: 'us-ne', location: 'University Park, PA' },
  { id: 'cmu', name: 'Carnegie Mellon University', wiki: 'Carnegie_Mellon_University', domain: 'cmu.edu', region: 'us-ne', location: 'Pittsburgh, PA' },
  { id: 'georgetown', name: 'Georgetown University', wiki: 'Georgetown_University', domain: 'georgetown.edu', region: 'us-ne', location: 'Washington, DC' },
  { id: 'rutgers', name: 'Rutgers University', wiki: 'Rutgers_University', domain: 'rutgers.edu', region: 'us-ne', location: 'New Brunswick, NJ' },
  { id: 'syracuse', name: 'Syracuse University', wiki: 'Syracuse_University', domain: 'syracuse.edu', region: 'us-ne', location: 'Syracuse, NY' },
  { id: 'rpi', name: 'Rensselaer Polytechnic Institute', wiki: 'Rensselaer_Polytechnic_Institute', domain: 'rpi.edu', region: 'us-ne', location: 'Troy, NY' },

  // ─── US South ────────────────────────────────────────────────
  { id: 'duke', name: 'Duke University', wiki: 'Duke_University', domain: 'duke.edu', region: 'us-s', location: 'Durham, NC' },
  { id: 'unc', name: 'University of North Carolina', wiki: 'University_of_North_Carolina_at_Chapel_Hill', domain: 'unc.edu', region: 'us-s', location: 'Chapel Hill, NC' },
  { id: 'gatech', name: 'Georgia Institute of Technology', wiki: 'Georgia_Institute_of_Technology', domain: 'gatech.edu', region: 'us-s', location: 'Atlanta, GA' },
  { id: 'emory', name: 'Emory University', wiki: 'Emory_University', domain: 'emory.edu', region: 'us-s', location: 'Atlanta, GA' },
  { id: 'uga', name: 'University of Georgia', wiki: 'University_of_Georgia', domain: 'uga.edu', region: 'us-s', location: 'Athens, GA' },
  { id: 'vanderbilt', name: 'Vanderbilt University', wiki: 'Vanderbilt_University', domain: 'vanderbilt.edu', region: 'us-s', location: 'Nashville, TN' },
  { id: 'utk', name: 'University of Tennessee', wiki: 'University_of_Tennessee', domain: 'utk.edu', region: 'us-s', location: 'Knoxville, TN' },
  { id: 'virginia', name: 'University of Virginia', wiki: 'University_of_Virginia', domain: 'virginia.edu', region: 'us-s', location: 'Charlottesville, VA' },
  { id: 'vt', name: 'Virginia Tech', wiki: 'Virginia_Tech', domain: 'vt.edu', region: 'us-s', location: 'Blacksburg, VA' },
  { id: 'rice', name: 'Rice University', wiki: 'Rice_University', domain: 'rice.edu', region: 'us-s', location: 'Houston, TX' },
  { id: 'utexas', name: 'University of Texas at Austin', wiki: 'University_of_Texas_at_Austin', domain: 'utexas.edu', region: 'us-s', location: 'Austin, TX' },
  { id: 'tamu', name: 'Texas A&M University', wiki: 'Texas_A%26M_University', domain: 'tamu.edu', region: 'us-s', location: 'College Station, TX' },
  { id: 'ufl', name: 'University of Florida', wiki: 'University_of_Florida', domain: 'ufl.edu', region: 'us-s', location: 'Gainesville, FL' },
  { id: 'miami', name: 'University of Miami', wiki: 'University_of_Miami', domain: 'miami.edu', region: 'us-s', location: 'Coral Gables, FL' },
  { id: 'tulane', name: 'Tulane University', wiki: 'Tulane_University', domain: 'tulane.edu', region: 'us-s', location: 'New Orleans, LA' },
  { id: 'lsu', name: 'Louisiana State University', wiki: 'Louisiana_State_University', domain: 'lsu.edu', region: 'us-s', location: 'Baton Rouge, LA' },
  { id: 'wakeforest', name: 'Wake Forest University', wiki: 'Wake_Forest_University', domain: 'wfu.edu', region: 'us-s', location: 'Winston-Salem, NC' },

  // ─── US Midwest ──────────────────────────────────────────────
  { id: 'uchicago', name: 'University of Chicago', wiki: 'University_of_Chicago', domain: 'uchicago.edu', region: 'us-mw', location: 'Chicago, IL' },
  { id: 'northwestern', name: 'Northwestern University', wiki: 'Northwestern_University', domain: 'northwestern.edu', region: 'us-mw', location: 'Evanston, IL' },
  { id: 'umich', name: 'University of Michigan', wiki: 'University_of_Michigan', domain: 'umich.edu', region: 'us-mw', location: 'Ann Arbor, MI' },
  { id: 'msu', name: 'Michigan State University', wiki: 'Michigan_State_University', domain: 'msu.edu', region: 'us-mw', location: 'East Lansing, MI' },
  { id: 'osu', name: 'Ohio State University', wiki: 'Ohio_State_University', domain: 'osu.edu', region: 'us-mw', location: 'Columbus, OH' },
  { id: 'wisc', name: 'University of Wisconsin', wiki: 'University_of_Wisconsin%E2%80%93Madison', domain: 'wisc.edu', region: 'us-mw', location: 'Madison, WI' },
  { id: 'umn', name: 'University of Minnesota', wiki: 'University_of_Minnesota', domain: 'umn.edu', region: 'us-mw', location: 'Minneapolis, MN' },
  { id: 'illinois', name: 'University of Illinois', wiki: 'University_of_Illinois_Urbana-Champaign', domain: 'illinois.edu', region: 'us-mw', location: 'Urbana-Champaign, IL' },
  { id: 'indiana', name: 'Indiana University', wiki: 'Indiana_University_Bloomington', domain: 'indiana.edu', region: 'us-mw', location: 'Bloomington, IN' },
  { id: 'purdue', name: 'Purdue University', wiki: 'Purdue_University', domain: 'purdue.edu', region: 'us-mw', location: 'West Lafayette, IN' },
  { id: 'uiowa', name: 'University of Iowa', wiki: 'University_of_Iowa', domain: 'uiowa.edu', region: 'us-mw', location: 'Iowa City, IA' },
  { id: 'iastate', name: 'Iowa State University', wiki: 'Iowa_State_University', domain: 'iastate.edu', region: 'us-mw', location: 'Ames, IA' },
  { id: 'missouri', name: 'University of Missouri', wiki: 'University_of_Missouri', domain: 'missouri.edu', region: 'us-mw', location: 'Columbia, MO' },
  { id: 'wustl', name: 'Washington University in St. Louis', wiki: 'Washington_University_in_St._Louis', domain: 'wustl.edu', region: 'us-mw', location: 'St. Louis, MO' },
  { id: 'nd', name: 'University of Notre Dame', wiki: 'University_of_Notre_Dame', domain: 'nd.edu', region: 'us-mw', location: 'Notre Dame, IN' },
  { id: 'ku', name: 'University of Kansas', wiki: 'University_of_Kansas', domain: 'ku.edu', region: 'us-mw', location: 'Lawrence, KS' },
  { id: 'nebraska', name: 'University of Nebraska', wiki: 'University_of_Nebraska%E2%80%93Lincoln', domain: 'unl.edu', region: 'us-mw', location: 'Lincoln, NE' },

  // ─── US West ─────────────────────────────────────────────────
  { id: 'stanford', name: 'Stanford University', wiki: 'Stanford_University', domain: 'stanford.edu', region: 'us-w', location: 'Stanford, CA' },
  { id: 'caltech', name: 'California Institute of Technology', wiki: 'California_Institute_of_Technology', domain: 'caltech.edu', region: 'us-w', location: 'Pasadena, CA' },
  { id: 'berkeley', name: 'UC Berkeley', wiki: 'University_of_California,_Berkeley', domain: 'berkeley.edu', region: 'us-w', location: 'Berkeley, CA' },
  { id: 'ucla', name: 'UCLA', wiki: 'University_of_California,_Los_Angeles', domain: 'ucla.edu', region: 'us-w', location: 'Los Angeles, CA' },
  { id: 'ucsd', name: 'UC San Diego', wiki: 'University_of_California,_San_Diego', domain: 'ucsd.edu', region: 'us-w', location: 'La Jolla, CA' },
  { id: 'ucdavis', name: 'UC Davis', wiki: 'University_of_California,_Davis', domain: 'ucdavis.edu', region: 'us-w', location: 'Davis, CA' },
  { id: 'ucsb', name: 'UC Santa Barbara', wiki: 'University_of_California,_Santa_Barbara', domain: 'ucsb.edu', region: 'us-w', location: 'Santa Barbara, CA' },
  { id: 'uci', name: 'UC Irvine', wiki: 'University_of_California,_Irvine', domain: 'uci.edu', region: 'us-w', location: 'Irvine, CA' },
  { id: 'ucsc', name: 'UC Santa Cruz', wiki: 'University_of_California,_Santa_Cruz', domain: 'ucsc.edu', region: 'us-w', location: 'Santa Cruz, CA' },
  { id: 'ucsf', name: 'UC San Francisco', wiki: 'University_of_California,_San_Francisco', domain: 'ucsf.edu', region: 'us-w', location: 'San Francisco, CA' },
  { id: 'ucr', name: 'UC Riverside', wiki: 'University_of_California,_Riverside', domain: 'ucr.edu', region: 'us-w', location: 'Riverside, CA' },
  { id: 'usc', name: 'University of Southern California', wiki: 'University_of_Southern_California', domain: 'usc.edu', region: 'us-w', location: 'Los Angeles, CA' },
  { id: 'washington', name: 'University of Washington', wiki: 'University_of_Washington', domain: 'washington.edu', region: 'us-w', location: 'Seattle, WA' },
  { id: 'oregon', name: 'University of Oregon', wiki: 'University_of_Oregon', domain: 'uoregon.edu', region: 'us-w', location: 'Eugene, OR' },
  { id: 'oregonstate', name: 'Oregon State University', wiki: 'Oregon_State_University', domain: 'oregonstate.edu', region: 'us-w', location: 'Corvallis, OR' },
  { id: 'washingtonstate', name: 'Washington State University', wiki: 'Washington_State_University', domain: 'wsu.edu', region: 'us-w', location: 'Pullman, WA' },
  { id: 'colorado', name: 'University of Colorado Boulder', wiki: 'University_of_Colorado_Boulder', domain: 'colorado.edu', region: 'us-w', location: 'Boulder, CO' },
  { id: 'colostate', name: 'Colorado State University', wiki: 'Colorado_State_University', domain: 'colostate.edu', region: 'us-w', location: 'Fort Collins, CO' },
  { id: 'asu', name: 'Arizona State University', wiki: 'Arizona_State_University', domain: 'asu.edu', region: 'us-w', location: 'Tempe, AZ' },
  { id: 'arizona', name: 'University of Arizona', wiki: 'University_of_Arizona', domain: 'arizona.edu', region: 'us-w', location: 'Tucson, AZ' },
  { id: 'utah', name: 'University of Utah', wiki: 'University_of_Utah', domain: 'utah.edu', region: 'us-w', location: 'Salt Lake City, UT' },
  { id: 'byu', name: 'Brigham Young University', wiki: 'Brigham_Young_University', domain: 'byu.edu', region: 'us-w', location: 'Provo, UT' },
  { id: 'unlv', name: 'University of Nevada, Las Vegas', wiki: 'University_of_Nevada,_Las_Vegas', domain: 'unlv.edu', region: 'us-w', location: 'Las Vegas, NV' },
  { id: 'hawaii', name: 'University of Hawaii at Manoa', wiki: 'University_of_Hawaii_at_Manoa', domain: 'hawaii.edu', region: 'us-w', location: 'Honolulu, HI' },

  // ─── Canada ──────────────────────────────────────────────────
  { id: 'utoronto', name: 'University of Toronto', wiki: 'University_of_Toronto', domain: 'utoronto.ca', region: 'canada', location: 'Toronto, ON' },
  { id: 'mcgill', name: 'McGill University', wiki: 'McGill_University', domain: 'mcgill.ca', region: 'canada', location: 'Montreal, QC' },
  { id: 'ubc', name: 'University of British Columbia', wiki: 'University_of_British_Columbia', domain: 'ubc.ca', region: 'canada', location: 'Vancouver, BC' },
  { id: 'uwaterloo', name: 'University of Waterloo', wiki: 'University_of_Waterloo', domain: 'uwaterloo.ca', region: 'canada', location: 'Waterloo, ON' },
  { id: 'ualberta', name: 'University of Alberta', wiki: 'University_of_Alberta', domain: 'ualberta.ca', region: 'canada', location: 'Edmonton, AB' },
  { id: 'ucalgary', name: 'University of Calgary', wiki: 'University_of_Calgary', domain: 'ucalgary.ca', region: 'canada', location: 'Calgary, AB' },
  { id: 'mcmaster', name: 'McMaster University', wiki: 'McMaster_University', domain: 'mcmaster.ca', region: 'canada', location: 'Hamilton, ON' },
  { id: 'westernu', name: 'Western University', wiki: 'University_of_Western_Ontario', domain: 'uwo.ca', region: 'canada', location: 'London, ON' },
  { id: 'queensu', name: "Queen's University", wiki: "Queen%27s_University_at_Kingston", domain: 'queensu.ca', region: 'canada', location: 'Kingston, ON' },
  { id: 'uottawa', name: 'University of Ottawa', wiki: 'University_of_Ottawa', domain: 'uottawa.ca', region: 'canada', location: 'Ottawa, ON' },
  { id: 'umontreal', name: 'Université de Montréal', wiki: 'Universit%C3%A9_de_Montr%C3%A9al', domain: 'umontreal.ca', region: 'canada', location: 'Montreal, QC' },
  { id: 'sfu', name: 'Simon Fraser University', wiki: 'Simon_Fraser_University', domain: 'sfu.ca', region: 'canada', location: 'Burnaby, BC' },
  { id: 'uvic', name: 'University of Victoria', wiki: 'University_of_Victoria', domain: 'uvic.ca', region: 'canada', location: 'Victoria, BC' },
  { id: 'yorku', name: 'York University', wiki: 'York_University', domain: 'yorku.ca', region: 'canada', location: 'Toronto, ON' },
  { id: 'concordia', name: 'Concordia University', wiki: 'Concordia_University', domain: 'concordia.ca', region: 'canada', location: 'Montreal, QC' },
  { id: 'dalhousie', name: 'Dalhousie University', wiki: 'Dalhousie_University', domain: 'dal.ca', region: 'canada', location: 'Halifax, NS' },
  { id: 'laval', name: 'Université Laval', wiki: 'Universit%C3%A9_Laval', domain: 'ulaval.ca', region: 'canada', location: 'Quebec City, QC' },
  { id: 'manitoba', name: 'University of Manitoba', wiki: 'University_of_Manitoba', domain: 'umanitoba.ca', region: 'canada', location: 'Winnipeg, MB' },
  { id: 'usask', name: 'University of Saskatchewan', wiki: 'University_of_Saskatchewan', domain: 'usask.ca', region: 'canada', location: 'Saskatoon, SK' },
  { id: 'guelph', name: 'University of Guelph', wiki: 'University_of_Guelph', domain: 'uoguelph.ca', region: 'canada', location: 'Guelph, ON' },
];

export const REGION_LABELS: Record<LogoPreset['region'], string> = {
  'us-ne': 'US Northeast',
  'us-s': 'US South',
  'us-mw': 'US Midwest',
  'us-w': 'US West',
  canada: 'Canada',
};

/**
 * Build the favicon URL for a preset. `sz=256` is the largest
 * reliable size Google s2 returns for most domains. This is the
 * SYNCHRONOUS fallback used for the grid thumbnails while the
 * user is browsing presets (no API call per card) and as the
 * last-resort when Wikipedia has no image for a given page.
 */
export function logoPresetUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
}

/**
 * Build a stable Commons image URL from a raw filename. Uses
 * `Special:FilePath` which 302-redirects to the real canonical
 * location of the file — saves us from having to MD5-hash the
 * filename or call the `imageinfo` API for every lookup. Works
 * directly as an `<img src>`.
 */
function commonsFileUrl(filename: string): string {
  // Wikidata returns filenames with SPACES. Special:FilePath
  // accepts underscores and spaces equally, but we encode for
  // safety so weird characters (parentheses, apostrophes,
  // accented letters) survive.
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
}

/**
 * Resolve the most brand-accurate image for a university via
 * Wikidata's structured claims, following a brand-first priority:
 *
 *   P154 — logo image         (wordmark / brand mark)
 *   P94  — coat of arms image (ceremonial crest)
 *   P158 — seal image         (official seal)
 *
 * P154 is always preferred because that's the university's
 * current marketing mark — it's what they use on their website,
 * letterhead, and conference slides. If a university has no
 * P154 claim (some flagships like UC-system campuses), we drop
 * down to P94 (crest), then P158 (seal), and finally fall back
 * to whatever image is on the Wikipedia infobox via the REST
 * summary endpoint (which was the previous behaviour).
 *
 * Returns null on any failure so the caller can chain to the
 * Google favicon fallback.
 */
export async function fetchWikiLogoUrl(
  wiki: string,
): Promise<string | null> {
  try {
    // Step 1: Wikidata structured claims — the brand-first path
    const wdRes = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${wiki}&props=claims&languages=en&format=json&origin=*`,
    );
    if (wdRes.ok) {
      const json = (await wdRes.json()) as {
        entities?: Record<
          string,
          {
            claims?: Record<
              string,
              Array<{ mainsnak?: { datavalue?: { value?: string } } }>
            >;
          }
        >;
      };
      const entity = Object.values(json.entities ?? {})[0];
      const claims = entity?.claims ?? {};
      // Skip obvious photographs — some Wikidata entries set
      // P154 to a JPG of a campus sign instead of a real brand
      // mark (Cornell is a known offender). Prefer vector /
      // lossless formats which indicate a real logo file.
      const isQualityLogo = (v: string | undefined): v is string => {
        if (!v) return false;
        const lower = v.toLowerCase();
        // Skip raster photo formats entirely — wordmarks are
        // always .svg / .png on Commons.
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return false;
        // Skip filenames that look like photographs of buildings
        // or signs (heuristic based on observed bad entries).
        if (/\b(sign|photo|building|campus|panoramio)\b/i.test(lower)) return false;
        return true;
      };
      const candidates = ['P154', 'P94', 'P158']
        .map((pid) => claims[pid]?.[0]?.mainsnak?.datavalue?.value)
        .filter(isQualityLogo);
      if (candidates.length > 0) return commonsFileUrl(candidates[0]!);
    }

    // Step 2: Fall back to the Wikipedia REST summary — returns
    // whatever image the page's infobox uses, usually the crest
    // or a building photo.
    const sumRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${wiki}?redirect=true`,
      { headers: { Accept: 'application/json' } },
    );
    if (!sumRes.ok) return null;
    const json = (await sumRes.json()) as {
      originalimage?: { source?: string };
      thumbnail?: { source?: string };
    };
    return json.originalimage?.source ?? json.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the best available logo URL for a preset.
 *
 *   1. Wikidata brand mark (P154) — university's modern logo
 *   2. Wikidata coat of arms (P94) — ceremonial crest
 *   3. Wikidata seal (P158) — official seal
 *   4. Wikipedia page infobox image — whatever the article uses
 *   5. Google s2 favicon — final fallback
 *
 * Returns a URL ready to drop into an `<img src>` or an image
 * block's `imageSrc`. Safe to call concurrently.
 */
export async function resolvePresetLogo(
  preset: LogoPreset,
): Promise<string> {
  const wikiUrl = await fetchWikiLogoUrl(preset.wiki);
  return wikiUrl ?? logoPresetUrl(preset.domain);
}

/**
 * Case-insensitive substring search across preset name, location,
 * and domain. Empty query returns the full list.
 */
export function searchLogoPresets(
  query: string,
): readonly LogoPreset[] {
  const q = query.trim().toLowerCase();
  if (!q) return LOGO_PRESETS;
  return LOGO_PRESETS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q) ||
      p.domain.toLowerCase().includes(q),
  );
}
