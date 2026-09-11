#!/usr/bin/env bash
#
# Post-deploy smoke test for the prerender step and the routing config.
#
# Why this exists: a prerendered route returns HTTP 200 whether the
# injection worked or not, because a bare shell and an injected document
# are both valid files. So status codes prove nothing there. The shell
# is small and fixed-size; a prerendered document is several KB larger
# and contains a <meta name="description">. Assert on those.
#
# It also asserts the routing contract: vercel.json enumerates the real
# client routes instead of a catch-all, so every enumerated route must
# still serve the app (200) and every unknown path must return a real
# 404 backed by dist/404.html — not the old soft-404 shell.
#
# Usage:
#   ./scripts/verify-prerender.sh https://www.postr.sh
#   ./scripts/verify-prerender.sh "$VERCEL_PREVIEW_URL"
set -uo pipefail

BASE="${1:-https://www.postr.sh}"
BASE="${BASE%/}"
MIN_BYTES=2000
failures=0

fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }
pass() { echo "  ok    $*"; }

echo "Verifying prerender at ${BASE}"
echo

echo "Prerendered routes carry real HTML:"
# paper-to-poster left this list when the manuscript flows were
# deactivated, and chart-chooser when the standalone plot picker was
# (routes.tsx header) — both are a rewrite + noindex now.
# tools/figure-readability is the one live standalone tool: a nested
# path, prerendered to dist/tools/figure-readability/index.html and
# served by cleanUrls exactly like the flat routes.
for route in "" about privacy cookies terms tools/figure-readability; do
  url="${BASE}/${route}"
  body="$(curl -sL --max-time 20 "$url")"
  bytes="${#body}"
  path="/${route}"

  if [ "$bytes" -lt "$MIN_BYTES" ]; then
    fail "${path} served ${bytes}B — that is the bare shell, injection did not run"
    continue
  fi
  if ! grep -q 'name="description"' <<<"$body"; then
    fail "${path} has no meta description"
    continue
  fi
  if ! grep -q 'rel="canonical"' <<<"$body"; then
    fail "${path} has no canonical"
    continue
  fi
  pass "${path} (${bytes}B, has description + canonical)"
done

echo
echo "Every route has a distinct title:"
titles="$(for route in "" about privacy cookies terms tools/figure-readability; do
  curl -sL --max-time 20 "${BASE}/${route}" |
    grep -o '<title>[^<]*</title>' | head -1
done)"
distinct="$(sort -u <<<"$titles" | wc -l | tr -d ' ')"
total="$(wc -l <<<"$titles" | tr -d ' ')"
if [ "$distinct" -eq "$total" ]; then
  pass "${distinct}/${total} distinct"
else
  fail "only ${distinct}/${total} distinct — routes are sharing a title"
fi

echo
echo "Crawl-control files are served as files, not rewritten to HTML:"
robots_ct="$(curl -sIL --max-time 20 "${BASE}/robots.txt" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tail -1)"
case "$robots_ct" in
  text/plain*) pass "robots.txt is ${robots_ct}" ;;
  *) fail "robots.txt is '${robots_ct}' — the SPA rewrite is swallowing it" ;;
esac

sitemap_ct="$(curl -sIL --max-time 20 "${BASE}/sitemap.xml" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tail -1)"
case "$sitemap_ct" in
  *xml*) pass "sitemap.xml is ${sitemap_ct}" ;;
  *) fail "sitemap.xml is '${sitemap_ct}' — Search Console will reject it" ;;
esac

echo
echo "Private and deactivated routes are noindex:"
for route in s/smoke-test-slug dashboard profile gallery chart-chooser paper-to-poster paper-to-slides presentation-checker; do
  hdr="$(curl -sIL --max-time 20 "${BASE}/${route}" | tr -d '\r' | grep -i '^x-robots-tag:' | tail -1)"
  if grep -qi 'noindex' <<<"$hdr"; then
    pass "/${route} → ${hdr}"
  else
    fail "/${route} has no noindex X-Robots-Tag (got: '${hdr:-none}')"
  fi
done

echo
echo "Real client routes still serve the app (200):"
# The deactivated routes (gallery, chart-chooser, paper-to-poster,
# paper-to-slides, presentation-checker) must serve the shell so the
# in-app <Navigate> to / runs, not 404.
for route in auth dashboard profile p/smoke-test-id admin/gallery gallery chart-chooser paper-to-poster paper-to-slides presentation-checker s/smoke-test-slug; do
  code="$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' "${BASE}/${route}")"
  if [ "$code" = "200" ]; then
    pass "/${route} → ${code}"
  else
    fail "/${route} → ${code} (expected 200 — is its rewrite missing from vercel.json?)"
  fi
done

echo
echo "Unknown paths return a real 404 with the branded page:"
# /debug is here on purpose: production builds drop the Debug route, so
# serving the shell there would be a soft 404. /tools is the bare parent
# of the figure-readability page and must not resolve to anything.
for route in wp-admin asdf random/deep/path.php debug tools; do
  code="$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' "${BASE}/${route}")"
  if [ "$code" != "404" ]; then
    fail "/${route} → ${code} (expected 404 — the soft-404 space is back)"
    continue
  fi
  body="$(curl -s --max-time 20 "${BASE}/${route}")"
  if grep -q 'Page not found' <<<"$body"; then
    pass "/${route} → 404 with the branded page"
  else
    fail "/${route} → 404 but the body is not dist/404.html"
  fi
done

echo
echo "Slug aliases 308 to their canonical page:"
# /manuscript-to-poster is the load-bearing one: it was live in
# production and listed in the deployed sitemap, so if this redirect
# ever goes missing a once-indexed URL starts returning 404. Every
# deactivated tool's alias points at / (routes.tsx header) —
# /plot-picker included, since its 308 to /chart-chooser was deployed
# and must be retargeted, not dropped. /plot-checker is the live one:
# it must land on the prerendered checker, not on /.
check_alias() {
  alias_path="$1"
  canonical="$2"
  code="$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' "${BASE}${alias_path}")"
  case "$code" in
    308|301) ;;
    *)
      fail "${alias_path} → ${code} (expected 308/301 to ${canonical})"
      return
      ;;
  esac
  location="$(curl -sI --max-time 20 "${BASE}${alias_path}" | tr -d '\r' |
    awk -F': ' 'tolower($1)=="location"{print $2}' | tail -1)"
  # Vercel emits the absolute form; strip the origin and require an EXACT
  # match. A suffix glob would make canonical "/" match ANY path ending in
  # a slash (e.g. a mis-pointed "/gallery/"), which is precisely the
  # mistake this gate exists to catch.
  location_path="${location#"$BASE"}"
  if [ "$location_path" = "$canonical" ]; then
    pass "${alias_path} → ${code} ${location}"
  else
    fail "${alias_path} → ${code} but Location is '${location}', expected ${canonical}"
  fi
}

check_alias /plot-checker /tools/figure-readability
check_alias /plot-picker /
check_alias /manuscript-to-poster /
check_alias /paper-to-present /
check_alias /paper-to-presentation /

echo
echo "Apex redirect is permanent:"
apex_host="$(sed -E 's#^https?://(www\.)?#https://#' <<<"$BASE")"
code="$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' "$apex_host")"
case "$code" in
  308|301) pass "apex → ${code}" ;;
  307|302) fail "apex → ${code} (temporary). Set it to permanent in the Vercel dashboard." ;;
  *) echo "  note  apex returned ${code}" ;;
esac

echo
if [ "$failures" -gt 0 ]; then
  echo "${failures} check(s) failed."
  exit 1
fi
echo "All checks passed."
