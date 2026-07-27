#!/usr/bin/env bash
#
# Post-deploy smoke test for the prerender step.
#
# Why this exists: every route returns HTTP 200 whether prerendering
# worked or not, because the catch-all rewrite serves the SPA shell for
# anything the filesystem does not match. So status codes prove nothing.
# The shell is small and fixed-size; a prerendered document is several
# KB larger and contains a <meta name="description">. Assert on those.
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
for route in "" about chart-chooser gallery privacy cookies terms; do
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
titles="$(for route in "" about gallery privacy cookies terms; do
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
echo "Private routes are noindex:"
for route in s/smoke-test-slug dashboard profile; do
  hdr="$(curl -sIL --max-time 20 "${BASE}/${route}" | tr -d '\r' | grep -i '^x-robots-tag:' | tail -1)"
  if grep -qi 'noindex' <<<"$hdr"; then
    pass "/${route} → ${hdr}"
  else
    fail "/${route} has no noindex X-Robots-Tag (got: '${hdr:-none}')"
  fi
done

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
