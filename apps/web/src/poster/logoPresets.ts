/**
 * Logo presets — curated North American university catalog.
 *
 * Each preset stores `{ id, name, domain, region }`. At click
 * time the LogoPicker uses Google's s2 favicon service to fetch
 * a 256×256 PNG of the institution's logo by domain:
 *
 *   https://www.google.com/s2/favicons?domain={domain}&sz=256
 *
 * Why Google favicons and not Wikipedia / Clearbit / a bundled
 * binary library:
 *
 *   - Google's service is free, stable, auth-free, and works
 *     for literally every valid domain. No TOS concerns for a
 *     user-facing preview.
 *   - Wikipedia's page-image API is hit-or-miss: some university
 *     pages return the logo, others return a building photo or
 *     historical portrait — and we can't verify 80+ entries
 *     without manual inspection.
 *   - Clearbit's logo API was acquired and pulled in 2024.
 *   - Bundling binary logos in the repo is a trademark gray
 *     zone and would add megabytes to every clone / deploy.
 *
 * 256 × 256 is print-insufficient (you'd want ~1200 px for a
 * 10 cm logo at 300 DPI), so the UI nudges users to upload their
 * own high-resolution file for the final export. The preset is a
 * "start here, replace before printing" convenience, not a
 * long-term asset.
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
  /** Domain used to fetch the favicon */
  domain: string;
  /** Region for filter buttons + rough grouping */
  region: 'us-ne' | 'us-s' | 'us-mw' | 'us-w' | 'canada';
  /** City / state hint for the search result card */
  location: string;
}

export const LOGO_PRESETS: readonly LogoPreset[] = [
  // ─── US Northeast ────────────────────────────────────────────
  { id: 'harvard', name: 'Harvard University', domain: 'harvard.edu', region: 'us-ne', location: 'Cambridge, MA' },
  { id: 'mit', name: 'Massachusetts Institute of Technology', domain: 'mit.edu', region: 'us-ne', location: 'Cambridge, MA' },
  { id: 'yale', name: 'Yale University', domain: 'yale.edu', region: 'us-ne', location: 'New Haven, CT' },
  { id: 'princeton', name: 'Princeton University', domain: 'princeton.edu', region: 'us-ne', location: 'Princeton, NJ' },
  { id: 'columbia', name: 'Columbia University', domain: 'columbia.edu', region: 'us-ne', location: 'New York, NY' },
  { id: 'upenn', name: 'University of Pennsylvania', domain: 'upenn.edu', region: 'us-ne', location: 'Philadelphia, PA' },
  { id: 'cornell', name: 'Cornell University', domain: 'cornell.edu', region: 'us-ne', location: 'Ithaca, NY' },
  { id: 'brown', name: 'Brown University', domain: 'brown.edu', region: 'us-ne', location: 'Providence, RI' },
  { id: 'dartmouth', name: 'Dartmouth College', domain: 'dartmouth.edu', region: 'us-ne', location: 'Hanover, NH' },
  { id: 'nyu', name: 'New York University', domain: 'nyu.edu', region: 'us-ne', location: 'New York, NY' },
  { id: 'jhu', name: 'Johns Hopkins University', domain: 'jhu.edu', region: 'us-ne', location: 'Baltimore, MD' },
  { id: 'bu', name: 'Boston University', domain: 'bu.edu', region: 'us-ne', location: 'Boston, MA' },
  { id: 'bc', name: 'Boston College', domain: 'bc.edu', region: 'us-ne', location: 'Chestnut Hill, MA' },
  { id: 'tufts', name: 'Tufts University', domain: 'tufts.edu', region: 'us-ne', location: 'Medford, MA' },
  { id: 'northeastern', name: 'Northeastern University', domain: 'northeastern.edu', region: 'us-ne', location: 'Boston, MA' },
  { id: 'umd', name: 'University of Maryland', domain: 'umd.edu', region: 'us-ne', location: 'College Park, MD' },
  { id: 'pitt', name: 'University of Pittsburgh', domain: 'pitt.edu', region: 'us-ne', location: 'Pittsburgh, PA' },
  { id: 'psu', name: 'Penn State University', domain: 'psu.edu', region: 'us-ne', location: 'University Park, PA' },
  { id: 'cmu', name: 'Carnegie Mellon University', domain: 'cmu.edu', region: 'us-ne', location: 'Pittsburgh, PA' },
  { id: 'georgetown', name: 'Georgetown University', domain: 'georgetown.edu', region: 'us-ne', location: 'Washington, DC' },
  { id: 'rutgers', name: 'Rutgers University', domain: 'rutgers.edu', region: 'us-ne', location: 'New Brunswick, NJ' },
  { id: 'syracuse', name: 'Syracuse University', domain: 'syracuse.edu', region: 'us-ne', location: 'Syracuse, NY' },
  { id: 'rpi', name: 'Rensselaer Polytechnic Institute', domain: 'rpi.edu', region: 'us-ne', location: 'Troy, NY' },

  // ─── US South ────────────────────────────────────────────────
  { id: 'duke', name: 'Duke University', domain: 'duke.edu', region: 'us-s', location: 'Durham, NC' },
  { id: 'unc', name: 'University of North Carolina', domain: 'unc.edu', region: 'us-s', location: 'Chapel Hill, NC' },
  { id: 'gatech', name: 'Georgia Institute of Technology', domain: 'gatech.edu', region: 'us-s', location: 'Atlanta, GA' },
  { id: 'emory', name: 'Emory University', domain: 'emory.edu', region: 'us-s', location: 'Atlanta, GA' },
  { id: 'uga', name: 'University of Georgia', domain: 'uga.edu', region: 'us-s', location: 'Athens, GA' },
  { id: 'vanderbilt', name: 'Vanderbilt University', domain: 'vanderbilt.edu', region: 'us-s', location: 'Nashville, TN' },
  { id: 'utk', name: 'University of Tennessee', domain: 'utk.edu', region: 'us-s', location: 'Knoxville, TN' },
  { id: 'virginia', name: 'University of Virginia', domain: 'virginia.edu', region: 'us-s', location: 'Charlottesville, VA' },
  { id: 'vt', name: 'Virginia Tech', domain: 'vt.edu', region: 'us-s', location: 'Blacksburg, VA' },
  { id: 'rice', name: 'Rice University', domain: 'rice.edu', region: 'us-s', location: 'Houston, TX' },
  { id: 'utexas', name: 'University of Texas at Austin', domain: 'utexas.edu', region: 'us-s', location: 'Austin, TX' },
  { id: 'tamu', name: 'Texas A&M University', domain: 'tamu.edu', region: 'us-s', location: 'College Station, TX' },
  { id: 'ufl', name: 'University of Florida', domain: 'ufl.edu', region: 'us-s', location: 'Gainesville, FL' },
  { id: 'miami', name: 'University of Miami', domain: 'miami.edu', region: 'us-s', location: 'Coral Gables, FL' },
  { id: 'tulane', name: 'Tulane University', domain: 'tulane.edu', region: 'us-s', location: 'New Orleans, LA' },
  { id: 'lsu', name: 'Louisiana State University', domain: 'lsu.edu', region: 'us-s', location: 'Baton Rouge, LA' },
  { id: 'wakeforest', name: 'Wake Forest University', domain: 'wfu.edu', region: 'us-s', location: 'Winston-Salem, NC' },

  // ─── US Midwest ──────────────────────────────────────────────
  { id: 'uchicago', name: 'University of Chicago', domain: 'uchicago.edu', region: 'us-mw', location: 'Chicago, IL' },
  { id: 'northwestern', name: 'Northwestern University', domain: 'northwestern.edu', region: 'us-mw', location: 'Evanston, IL' },
  { id: 'umich', name: 'University of Michigan', domain: 'umich.edu', region: 'us-mw', location: 'Ann Arbor, MI' },
  { id: 'msu', name: 'Michigan State University', domain: 'msu.edu', region: 'us-mw', location: 'East Lansing, MI' },
  { id: 'osu', name: 'Ohio State University', domain: 'osu.edu', region: 'us-mw', location: 'Columbus, OH' },
  { id: 'wisc', name: 'University of Wisconsin', domain: 'wisc.edu', region: 'us-mw', location: 'Madison, WI' },
  { id: 'umn', name: 'University of Minnesota', domain: 'umn.edu', region: 'us-mw', location: 'Minneapolis, MN' },
  { id: 'illinois', name: 'University of Illinois', domain: 'illinois.edu', region: 'us-mw', location: 'Urbana-Champaign, IL' },
  { id: 'indiana', name: 'Indiana University', domain: 'indiana.edu', region: 'us-mw', location: 'Bloomington, IN' },
  { id: 'purdue', name: 'Purdue University', domain: 'purdue.edu', region: 'us-mw', location: 'West Lafayette, IN' },
  { id: 'uiowa', name: 'University of Iowa', domain: 'uiowa.edu', region: 'us-mw', location: 'Iowa City, IA' },
  { id: 'iastate', name: 'Iowa State University', domain: 'iastate.edu', region: 'us-mw', location: 'Ames, IA' },
  { id: 'missouri', name: 'University of Missouri', domain: 'missouri.edu', region: 'us-mw', location: 'Columbia, MO' },
  { id: 'wustl', name: 'Washington University in St. Louis', domain: 'wustl.edu', region: 'us-mw', location: 'St. Louis, MO' },
  { id: 'nd', name: 'University of Notre Dame', domain: 'nd.edu', region: 'us-mw', location: 'Notre Dame, IN' },
  { id: 'ku', name: 'University of Kansas', domain: 'ku.edu', region: 'us-mw', location: 'Lawrence, KS' },
  { id: 'nebraska', name: 'University of Nebraska', domain: 'unl.edu', region: 'us-mw', location: 'Lincoln, NE' },

  // ─── US West ─────────────────────────────────────────────────
  { id: 'stanford', name: 'Stanford University', domain: 'stanford.edu', region: 'us-w', location: 'Stanford, CA' },
  { id: 'caltech', name: 'California Institute of Technology', domain: 'caltech.edu', region: 'us-w', location: 'Pasadena, CA' },
  { id: 'berkeley', name: 'UC Berkeley', domain: 'berkeley.edu', region: 'us-w', location: 'Berkeley, CA' },
  { id: 'ucla', name: 'UCLA', domain: 'ucla.edu', region: 'us-w', location: 'Los Angeles, CA' },
  { id: 'ucsd', name: 'UC San Diego', domain: 'ucsd.edu', region: 'us-w', location: 'La Jolla, CA' },
  { id: 'ucdavis', name: 'UC Davis', domain: 'ucdavis.edu', region: 'us-w', location: 'Davis, CA' },
  { id: 'ucsb', name: 'UC Santa Barbara', domain: 'ucsb.edu', region: 'us-w', location: 'Santa Barbara, CA' },
  { id: 'uci', name: 'UC Irvine', domain: 'uci.edu', region: 'us-w', location: 'Irvine, CA' },
  { id: 'ucsc', name: 'UC Santa Cruz', domain: 'ucsc.edu', region: 'us-w', location: 'Santa Cruz, CA' },
  { id: 'ucsf', name: 'UC San Francisco', domain: 'ucsf.edu', region: 'us-w', location: 'San Francisco, CA' },
  { id: 'ucr', name: 'UC Riverside', domain: 'ucr.edu', region: 'us-w', location: 'Riverside, CA' },
  { id: 'usc', name: 'University of Southern California', domain: 'usc.edu', region: 'us-w', location: 'Los Angeles, CA' },
  { id: 'washington', name: 'University of Washington', domain: 'washington.edu', region: 'us-w', location: 'Seattle, WA' },
  { id: 'oregon', name: 'University of Oregon', domain: 'uoregon.edu', region: 'us-w', location: 'Eugene, OR' },
  { id: 'oregonstate', name: 'Oregon State University', domain: 'oregonstate.edu', region: 'us-w', location: 'Corvallis, OR' },
  { id: 'washingtonstate', name: 'Washington State University', domain: 'wsu.edu', region: 'us-w', location: 'Pullman, WA' },
  { id: 'colorado', name: 'University of Colorado Boulder', domain: 'colorado.edu', region: 'us-w', location: 'Boulder, CO' },
  { id: 'colostate', name: 'Colorado State University', domain: 'colostate.edu', region: 'us-w', location: 'Fort Collins, CO' },
  { id: 'asu', name: 'Arizona State University', domain: 'asu.edu', region: 'us-w', location: 'Tempe, AZ' },
  { id: 'arizona', name: 'University of Arizona', domain: 'arizona.edu', region: 'us-w', location: 'Tucson, AZ' },
  { id: 'utah', name: 'University of Utah', domain: 'utah.edu', region: 'us-w', location: 'Salt Lake City, UT' },
  { id: 'byu', name: 'Brigham Young University', domain: 'byu.edu', region: 'us-w', location: 'Provo, UT' },
  { id: 'unlv', name: 'University of Nevada, Las Vegas', domain: 'unlv.edu', region: 'us-w', location: 'Las Vegas, NV' },
  { id: 'hawaii', name: 'University of Hawaii at Manoa', domain: 'hawaii.edu', region: 'us-w', location: 'Honolulu, HI' },

  // ─── Canada ──────────────────────────────────────────────────
  { id: 'utoronto', name: 'University of Toronto', domain: 'utoronto.ca', region: 'canada', location: 'Toronto, ON' },
  { id: 'mcgill', name: 'McGill University', domain: 'mcgill.ca', region: 'canada', location: 'Montreal, QC' },
  { id: 'ubc', name: 'University of British Columbia', domain: 'ubc.ca', region: 'canada', location: 'Vancouver, BC' },
  { id: 'uwaterloo', name: 'University of Waterloo', domain: 'uwaterloo.ca', region: 'canada', location: 'Waterloo, ON' },
  { id: 'ualberta', name: 'University of Alberta', domain: 'ualberta.ca', region: 'canada', location: 'Edmonton, AB' },
  { id: 'ucalgary', name: 'University of Calgary', domain: 'ucalgary.ca', region: 'canada', location: 'Calgary, AB' },
  { id: 'mcmaster', name: 'McMaster University', domain: 'mcmaster.ca', region: 'canada', location: 'Hamilton, ON' },
  { id: 'westernu', name: 'Western University', domain: 'uwo.ca', region: 'canada', location: 'London, ON' },
  { id: 'queensu', name: "Queen's University", domain: 'queensu.ca', region: 'canada', location: 'Kingston, ON' },
  { id: 'uottawa', name: 'University of Ottawa', domain: 'uottawa.ca', region: 'canada', location: 'Ottawa, ON' },
  { id: 'umontreal', name: 'Université de Montréal', domain: 'umontreal.ca', region: 'canada', location: 'Montreal, QC' },
  { id: 'sfu', name: 'Simon Fraser University', domain: 'sfu.ca', region: 'canada', location: 'Burnaby, BC' },
  { id: 'uvic', name: 'University of Victoria', domain: 'uvic.ca', region: 'canada', location: 'Victoria, BC' },
  { id: 'yorku', name: 'York University', domain: 'yorku.ca', region: 'canada', location: 'Toronto, ON' },
  { id: 'concordia', name: 'Concordia University', domain: 'concordia.ca', region: 'canada', location: 'Montreal, QC' },
  { id: 'dalhousie', name: 'Dalhousie University', domain: 'dal.ca', region: 'canada', location: 'Halifax, NS' },
  { id: 'laval', name: 'Université Laval', domain: 'ulaval.ca', region: 'canada', location: 'Quebec City, QC' },
  { id: 'manitoba', name: 'University of Manitoba', domain: 'umanitoba.ca', region: 'canada', location: 'Winnipeg, MB' },
  { id: 'usask', name: 'University of Saskatchewan', domain: 'usask.ca', region: 'canada', location: 'Saskatoon, SK' },
  { id: 'guelph', name: 'University of Guelph', domain: 'uoguelph.ca', region: 'canada', location: 'Guelph, ON' },
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
 * reliable size Google s2 returns for most domains; some
 * universities have larger variants, but 256 is the safe default
 * that always works. The URL is stable and can be embedded in
 * poster documents directly.
 */
export function logoPresetUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
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
