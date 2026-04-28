#!/usr/bin/env node
/**
 * Decode a `.postr` bundle into its constituent files.
 *
 * `.postr` is a renamed `.zip` containing:
 *   poster.json     — PosterDoc, with imageSrc rewritten to
 *                     "bundle://<blockId>.<ext>"
 *   manifest.json   — { schemaVersion, app, appVersion, exportedAt, hash }
 *   assets/         — every figure / logo image, named by blockId
 *
 * Useful when:
 *   • the user (or an agent) wants to inspect a sample poster
 *     locally without spinning up the editor
 *   • CI needs to validate a bundle against the schema
 *   • the backend needs to seed a new account from a bundled
 *     template (this script lays the groundwork — the actual
 *     server-side seeder would parse poster.json the same way)
 *
 * Usage:
 *   node scripts/decode-postr.mjs <path/to/file.postr>             # summary to stdout
 *   node scripts/decode-postr.mjs <file.postr> --extract <outDir>  # write all files
 *   node scripts/decode-postr.mjs <file.postr> --json              # full poster.json to stdout
 *
 * Exit codes:
 *   0  success
 *   1  user error (missing args, file not readable, malformed bundle)
 *   2  schema mismatch — manifest.schemaVersion not 1
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, basename, join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

function usage(exitCode = 1) {
  process.stderr.write(
    [
      'Usage:',
      '  node scripts/decode-postr.mjs <file.postr>                  # summary',
      '  node scripts/decode-postr.mjs <file.postr> --extract <dir>  # extract all',
      '  node scripts/decode-postr.mjs <file.postr> --json           # full poster.json',
      '',
    ].join('\n'),
  );
  process.exit(exitCode);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') usage(0);

  const file = argv[0];
  const extractIdx = argv.indexOf('--extract');
  const wantJson = argv.includes('--json');
  const wantExtract = extractIdx >= 0;
  const extractDir = wantExtract ? argv[extractIdx + 1] : null;
  if (wantExtract && !extractDir) {
    process.stderr.write('--extract requires a directory argument.\n');
    process.exit(1);
  }

  let bytes;
  try {
    bytes = await readFile(resolve(file));
  } catch (err) {
    process.stderr.write(`Could not read ${file}: ${err.message}\n`);
    process.exit(1);
  }

  let entries;
  try {
    entries = unzipSync(new Uint8Array(bytes));
  } catch (err) {
    process.stderr.write(`Bundle is not a valid zip: ${err.message}\n`);
    process.exit(1);
  }

  const docBytes = entries['poster.json'];
  const manifestBytes = entries['manifest.json'];
  if (!docBytes) {
    process.stderr.write('Bundle missing poster.json.\n');
    process.exit(1);
  }
  if (!manifestBytes) {
    process.stderr.write('Bundle missing manifest.json.\n');
    process.exit(1);
  }

  const docJson = strFromU8(docBytes);
  const manifest = JSON.parse(strFromU8(manifestBytes));
  const doc = JSON.parse(docJson);

  // Hash check — match the editor's exportPostr() canonical-JSON
  // hash of poster.json so we know whether the bundle has been
  // tampered with vs. what the editor wrote.
  const sha = createHash('sha256').update(docJson).digest('hex');
  const hashMatch = manifest.hash === sha;

  if (wantJson) {
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
    return;
  }

  if (wantExtract) {
    const outRoot = resolve(extractDir);
    await mkdir(outRoot, { recursive: true });
    await mkdir(join(outRoot, 'assets'), { recursive: true });
    for (const [name, body] of Object.entries(entries)) {
      await writeFile(join(outRoot, name), body);
    }
    process.stdout.write(`Extracted ${Object.keys(entries).length} files to ${outRoot}\n`);
    return;
  }

  // Default: summary report
  const assetEntries = Object.entries(entries).filter(([n]) =>
    n.startsWith('assets/'),
  );
  const assetTotalBytes = assetEntries.reduce(
    (sum, [, body]) => sum + body.byteLength,
    0,
  );
  const blockTypeCounts = {};
  for (const b of doc.blocks ?? []) {
    blockTypeCounts[b.type] = (blockTypeCounts[b.type] ?? 0) + 1;
  }

  const out = [
    `File:           ${basename(file)}`,
    `Bundle size:    ${(bytes.byteLength / 1024).toFixed(1)} KB`,
    '',
    `Schema version: ${manifest.schemaVersion}`,
    `App version:    ${manifest.app ?? '?'} ${manifest.appVersion ?? '?'}`,
    `Exported at:    ${manifest.exportedAt ?? '?'}`,
    `Hash match:     ${hashMatch ? 'yes' : 'NO — bundle modified after export'}`,
    '',
    `Title:          ${extractTitleSnippet(doc)}`,
    `Page size:      ${doc.widthIn ?? '?'}″ × ${doc.heightIn ?? '?'}″`,
    `Font family:    ${doc.fontFamily ?? '?'}`,
    `Authors:        ${(doc.authors ?? []).length}`,
    `Institutions:   ${(doc.institutions ?? []).length}`,
    `References:     ${(doc.references ?? []).length}`,
    `Blocks:         ${(doc.blocks ?? []).length}  (${formatTypeCounts(blockTypeCounts)})`,
    '',
    `Assets:         ${assetEntries.length}  (${(assetTotalBytes / 1024).toFixed(1)} KB)`,
    ...assetEntries.slice(0, 10).map(([n, b]) =>
      `  · ${n.replace(/^assets\//, '').padEnd(20)} ${(b.byteLength / 1024).toFixed(1)} KB`,
    ),
    assetEntries.length > 10 ? `  · …and ${assetEntries.length - 10} more` : '',
    '',
    'Run with --json to print the full poster.json,',
    'or --extract <dir> to write every file to disk.',
  ];
  process.stdout.write(out.filter(Boolean).join('\n') + '\n');

  if (manifest.schemaVersion !== 1) {
    process.exit(2);
  }
}

function extractTitleSnippet(doc) {
  const titleBlk = (doc.blocks ?? []).find((b) => b.type === 'title');
  const text = (titleBlk?.content ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '(no title)';
  return text.length > 80 ? text.slice(0, 77) + '…' : text;
}

function formatTypeCounts(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}:${n}`)
    .join(', ');
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
