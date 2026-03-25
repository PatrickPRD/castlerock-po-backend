#!/usr/bin/env node
/**
 * generate-update.js
 * ==================
 * Generates a .CTUpdate package containing only files that have changed
 * since the last manifest snapshot.
 *
 * Usage:
 *   node generate-update.js --version 1.2.0 --description "Fix invoice sorting"
 *   node generate-update.js --version 1.2.0 --description "..." --out ./releases
 *   node generate-update.js --version 1.2.0 --full          # include ALL tracked files
 *
 * Options:
 *   --version    Required. Semver string for this release (e.g. 1.2.0)
 *   --description Optional. Short summary of what changed.
 *   --base       Optional. Base version string recorded in the package.
 *   --out        Optional. Output directory (default: ./releases)
 *   --full       Optional flag. Package every tracked file, not just changed ones.
 *   --dry-run    Optional flag. Print what would be included without writing files.
 *
 * Files are sourced from: src/, public/, database/migrations/
 * Tracked extensions:     .js  .ejs  .css  .sql  .json
 *
 * Protected paths (never included): .env, package.json, package-lock.json,
 * backups/, node_modules/, update-manifest.json itself.
 *
 * The output is a JSON file with a .CTUpdate extension. It contains:
 *   - format, version, releasedAt, description, baseVersion
 *   - files[] — base64-encoded content + sha256 hash for each changed file
 *   - checksum — sha256 of the whole object (minus the checksum field)
 *
 * After a successful package is written, update-manifest.json is updated
 * to record the new hashes (unless --dry-run).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Configuration ──────────────────────────────────────────────────────────

const ROOT = __dirname;
const MANIFEST_PATH = path.join(ROOT, 'update-manifest.json');

const TRACKED_DIRS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'public'),
  path.join(ROOT, 'database', 'migrations')
];

const TRACKED_EXTENSIONS = new Set(['.js', '.ejs', '.css', '.sql', '.json']);

// Paths (relative to ROOT) that must never be packaged
const PROTECTED_REL = new Set([
  '.env',
  'package.json',
  'package-lock.json',
  'update-manifest.json',
  path.join('database', 'migrations') // migrations dir itself — included individually
]);
const PROTECTED_ABS = new Set([
  path.join(ROOT, '.env'),
  path.join(ROOT, 'package.json'),
  path.join(ROOT, 'package-lock.json'),
  path.join(ROOT, 'update-manifest.json'),
  path.join(ROOT, 'backups'),
  path.join(ROOT, 'node_modules')
]);

// ── Argument parsing ────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { out: path.join(ROOT, 'releases'), full: false, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--version':     opts.version = args[++i]; break;
      case '--description': opts.description = args[++i]; break;
      case '--base':        opts.base = args[++i]; break;
      case '--out':         opts.out = path.resolve(args[++i]); break;
      case '--full':        opts.full = true; break;
      case '--dry-run':     opts.dryRun = true; break;
      default:
        console.warn(`Unknown argument: ${args[i]}`);
    }
  }

  if (!opts.version) {
    console.error('Error: --version is required.');
    process.exit(1);
  }

  if (!/^\d+\.\d+\.\d+/.test(opts.version)) {
    console.error('Error: --version must be semver (e.g. 1.2.0).');
    process.exit(1);
  }

  return opts;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256Str(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function isProtected(absPath) {
  for (const p of PROTECTED_ABS) {
    if (absPath === p || absPath.startsWith(p + path.sep)) return true;
  }
  return false;
}

function isTracked(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (!TRACKED_EXTENSIONS.has(ext)) return false;
  return TRACKED_DIRS.some(dir => absPath.startsWith(dir + path.sep));
}

/**
 * Recursively collect all tracked files under a directory.
 */
function collectFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isProtected(full)) continue;
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (entry.isFile() && isTracked(full)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Load the manifest from disk, or return an empty one.
 */
function loadManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch {
      return { version: '0.0.0', files: {} };
    }
  }
  return { version: '0.0.0', files: {} };
}

/**
 * Save manifest to disk.
 */
function saveManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const opts = parseArgs();
  const manifest = loadManifest();

  console.log(`\n🔍  Scanning tracked files…`);

  // Collect all tracked files
  const allFiles = [];
  for (const dir of TRACKED_DIRS) {
    collectFiles(dir, allFiles);
  }

  console.log(`    Found ${allFiles.length} tracked file(s)`);

  // Determine which files have changed
  const changedFiles = [];
  const newHashes = {};

  for (const absPath of allFiles) {
    const relPath = path.relative(ROOT, absPath).replace(/\\/g, '/');
    const content = fs.readFileSync(absPath);
    const hash = sha256(content);
    newHashes[relPath] = hash;

    const previousHash = manifest.files[relPath];
    if (opts.full || !previousHash || previousHash !== hash) {
      changedFiles.push({ relPath, absPath, content, hash, isNew: !previousHash });
    }
  }

  // Detect deletions (files in manifest that no longer exist on disk)
  const deletedFiles = [];
  for (const [relPath, _hash] of Object.entries(manifest.files || {})) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      deletedFiles.push(relPath);
    }
  }

  console.log(`\n📋  Summary:`);
  console.log(`    Changed/new : ${changedFiles.length}`);
  console.log(`    Deleted     : ${deletedFiles.length}`);
  console.log(`    Unchanged   : ${allFiles.length - changedFiles.length}`);

  if (changedFiles.length === 0 && deletedFiles.length === 0) {
    console.log('\n✅  Nothing to package — all files match the current manifest.');
    process.exit(0);
  }

  if (opts.dryRun) {
    console.log('\n📄  Files that would be included:');
    changedFiles.forEach(f => console.log(`    [${f.isNew ? 'NEW' : 'UPD'}] ${f.relPath}`));
    deletedFiles.forEach(p => console.log(`    [DEL] ${p}`));
    console.log('\n(Dry run — no files written)\n');
    process.exit(0);
  }

  // Build the package
  const fileEntries = [
    ...changedFiles.map(f => ({
      path: f.relPath,
      action: 'update',
      hash: f.hash,
      content: f.content.toString('base64')
    })),
    ...deletedFiles.map(p => ({
      path: p,
      action: 'delete'
    }))
  ];

  const pkg = {
    format: 'CTUpdate',
    version: opts.version,
    baseVersion: opts.base || manifest.version || '0.0.0',
    releasedAt: new Date().toISOString(),
    description: opts.description || '',
    files: fileEntries,
    migrations: [] // reserved for future use
  };

  // Compute checksum over the object WITHOUT the checksum field
  pkg.checksum = sha256Str(JSON.stringify(pkg));

  const filename = `update-${opts.version}-${Date.now()}.CTUpdate`;
  const outDir = opts.out;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(pkg, null, 2), 'utf8');

  console.log(`\n✅  Package written: ${outPath}`);
  console.log(`    Files included : ${fileEntries.length}`);
  console.log(`    Package size   : ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

  // Update manifest
  manifest.version = opts.version;
  manifest.createdAt = manifest.createdAt || new Date().toISOString();
  for (const [relPath, hash] of Object.entries(newHashes)) {
    manifest.files[relPath] = hash;
  }
  for (const relPath of deletedFiles) {
    delete manifest.files[relPath];
  }
  saveManifest(manifest);
  console.log(`    Manifest updated: ${MANIFEST_PATH}\n`);
}

run().catch(err => {
  console.error('\n❌  generate-update failed:', err.message);
  process.exit(1);
});
