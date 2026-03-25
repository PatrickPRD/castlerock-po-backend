const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');

const ROOT_DIR = path.join(__dirname, '../../');
const MANIFEST_PATH = path.join(ROOT_DIR, 'update-manifest.json');

// Directories whose files are eligible to be included in update packages
const TRACKED_DIRS = [
  'src',
  'public',
  path.join('database', 'migrations')
];

// File extensions eligible for update
const TRACKED_EXTENSIONS = new Set(['.js', '.ejs', '.css', '.sql', '.json']);

// Paths that must never be overwritten by an update package
const PROTECTED_PATHS = new Set([
  '.env',
  'package.json',
  'package-lock.json',
  path.join('database', 'migrations') // migrations are append-only, handled separately
]);

// The update package must contain these top-level fields
const REQUIRED_PACKAGE_FIELDS = ['format', 'version', 'files', 'checksum'];

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Verify that a file path from an update package is safe to write.
 * Prevents directory traversal and protects critical files.
 */
function validateUpdatePath(filePath) {
  // Normalise and resolve against root
  const normalised = path.normalize(filePath).replace(/\\/g, '/');

  // Must not be absolute
  if (path.isAbsolute(normalised)) {
    throw new Error(`Update path must be relative: ${filePath}`);
  }

  // Must not traverse up
  if (normalised.startsWith('..') || normalised.includes('/../')) {
    throw new Error(`Update path directory traversal detected: ${filePath}`);
  }

  // Resolve full absolute path
  const resolved = path.resolve(ROOT_DIR, normalised);
  const rootResolved = path.resolve(ROOT_DIR);

  // Ensure resolved path stays within the project root
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    throw new Error(`Update path escapes project root: ${filePath}`);
  }

  // Block protected paths
  for (const protected_ of PROTECTED_PATHS) {
    const protectedResolved = path.resolve(ROOT_DIR, protected_);
    if (resolved === protectedResolved || resolved.startsWith(protectedResolved + path.sep)) {
      throw new Error(`Update path targets a protected location: ${filePath}`);
    }
  }

  // Must be within a tracked directory
  const inTracked = TRACKED_DIRS.some(dir => {
    const dirResolved = path.resolve(ROOT_DIR, dir);
    return resolved.startsWith(dirResolved + path.sep);
  });

  if (!inTracked) {
    throw new Error(`Update path is outside tracked directories: ${filePath}`);
  }

  const ext = path.extname(normalised).toLowerCase();
  if (!TRACKED_EXTENSIONS.has(ext)) {
    throw new Error(`Update path has disallowed extension (${ext}): ${filePath}`);
  }

  return resolved;
}

/**
 * Verify the package-level checksum to detect tampering.
 */
function verifyPackageChecksum(pkg) {
  const { checksum, ...rest } = pkg;
  const computed = sha256(JSON.stringify(rest));
  if (!checksum || checksum !== computed) {
    throw new Error('Update package checksum verification failed. The package may be corrupt or tampered.');
  }
}

/**
 * Parse and validate an uploaded update package buffer.
 * Returns the parsed package object.
 */
async function parseUpdatePackage(buffer) {
  let pkg;
  try {
    pkg = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error('Update package is not valid JSON.');
  }

  if (pkg.format !== 'CTUpdate') {
    throw new Error('Not a valid CTUpdate package (format mismatch).');
  }

  for (const field of REQUIRED_PACKAGE_FIELDS) {
    if (!(field in pkg)) {
      throw new Error(`Update package is missing required field: ${field}`);
    }
  }

  if (!Array.isArray(pkg.files)) {
    throw new Error('Update package "files" must be an array.');
  }

  verifyPackageChecksum(pkg);

  // Validate and enrich each file entry
  for (const entry of pkg.files) {
    if (!entry.path || !entry.action) {
      throw new Error('Each file entry must have "path" and "action" fields.');
    }
    if (!['update', 'delete'].includes(entry.action)) {
      throw new Error(`Unknown action "${entry.action}" in file entry: ${entry.path}`);
    }
    if (entry.action === 'update') {
      if (!entry.content || typeof entry.content !== 'string') {
        throw new Error(`File entry missing content for update: ${entry.path}`);
      }
      if (!entry.hash) {
        throw new Error(`File entry missing hash for: ${entry.path}`);
      }
    }

    // Security: validate paths eagerly during parse
    entry._resolvedPath = validateUpdatePath(entry.path);
  }

  return pkg;
}

/**
 * Read the current update manifest from disk.
 */
async function readManifest() {
  try {
    const content = await fs.readFile(MANIFEST_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    return { version: '0.0.0', createdAt: null, files: {} };
  }
}

/**
 * Write the update manifest to disk.
 */
async function writeManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Preview an update — returns files to be changed without writing anything.
 */
async function previewUpdate(pkg) {
  const preview = {
    version: pkg.version,
    description: pkg.description || '',
    releasedAt: pkg.releasedAt || null,
    baseVersion: pkg.baseVersion || null,
    files: [],
    migrations: pkg.migrations || []
  };

  for (const entry of pkg.files) {
    const absPath = entry._resolvedPath;
    let currentExists = false;
    let isNew = false;
    let hashMatch = null;

    try {
      const existing = await fs.readFile(absPath);
      currentExists = true;
      const currentHash = sha256(existing);
      hashMatch = entry.action === 'update' ? (currentHash === entry.hash) : null;
      isNew = false;
    } catch {
      isNew = entry.action === 'update';
      currentExists = false;
      hashMatch = null;
    }

    preview.files.push({
      path: entry.path,
      action: entry.action,
      isNew,
      alreadyCurrent: hashMatch === true
    });
  }

  return preview;
}

/**
 * Apply an update package.
 * Writes files, records in DB, updates manifest.
 */
async function applyUpdate(pkg, userId) {
  const applied = [];
  const skipped = [];

  for (const entry of pkg.files) {
    const absPath = entry._resolvedPath;

    if (entry.action === 'update') {
      const decoded = Buffer.from(entry.content, 'base64');

      // Verify content hash before writing
      const contentHash = sha256(decoded);
      if (contentHash !== entry.hash) {
        throw new Error(`Hash mismatch for file ${entry.path}: package may be corrupt.`);
      }

      // State-aware update: skip files that are already at the target hash.
      try {
        const existing = await fs.readFile(absPath);
        const existingHash = sha256(existing);
        if (existingHash === entry.hash) {
          skipped.push({ path: entry.path, reason: 'already current' });
          continue;
        }
      } catch {
        // Missing file is expected on older installs; write below.
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, decoded);
      applied.push({ path: entry.path, action: 'updated' });

    } else if (entry.action === 'delete') {
      try {
        await fs.unlink(absPath);
        applied.push({ path: entry.path, action: 'deleted' });
      } catch {
        skipped.push({ path: entry.path, reason: 'file not found, skipped delete' });
      }
    }
  }

  // Update manifest
  const manifest = await readManifest();
  manifest.version = pkg.version;
  manifest.createdAt = manifest.createdAt || new Date().toISOString();

  for (const entry of pkg.files) {
    if (entry.action === 'update') {
      manifest.files[entry.path] = entry.hash;
    } else if (entry.action === 'delete') {
      delete manifest.files[entry.path];
    }
  }
  await writeManifest(manifest);

  // Record in DB
  const filesSummary = { applied, skipped };
  await pool.query(
    `INSERT INTO system_updates
       (version, filename, description, file_count, migration_count, status, applied_at, applied_by, files_summary)
     VALUES (?, ?, ?, ?, ?, 'applied', NOW(), ?, ?)`,
    [
      pkg.version,
      pkg._filename || `update-${pkg.version}.CTUpdate`,
      pkg.description || null,
      pkg.files.length,
      (pkg.migrations || []).length,
      userId || null,
      JSON.stringify(filesSummary)
    ]
  );

  return { applied, skipped };
}

/**
 * Record a failed update attempt in the DB.
 */
async function recordFailedUpdate(pkg, filename, userId, errorMessage) {
  try {
    await pool.query(
      `INSERT INTO system_updates
         (version, filename, description, file_count, migration_count, status, applied_by, error_message)
       VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`,
      [
        pkg.version || 'unknown',
        filename || 'unknown',
        pkg.description || null,
        Array.isArray(pkg.files) ? pkg.files.length : 0,
        Array.isArray(pkg.migrations) ? pkg.migrations.length : 0,
        userId || null,
        errorMessage
      ]
    );
  } catch {
    // best effort; do not mask the original error
  }
}

/**
 * Return all update records from the DB, newest first.
 */
async function listUpdates() {
  const [rows] = await pool.query(
    `SELECT id, version, filename, description, file_count, migration_count,
            status, applied_at, applied_by, error_message, created_at
     FROM system_updates
     ORDER BY created_at DESC`
  );
  return rows;
}

/**
 * Return a single update record.
 */
async function getUpdate(id) {
  const [rows] = await pool.query(
    `SELECT * FROM system_updates WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Get the current installed version from the manifest.
 */
async function getCurrentVersion() {
  const manifest = await readManifest();
  return manifest.version || '0.0.0';
}

module.exports = {
  parseUpdatePackage,
  previewUpdate,
  applyUpdate,
  recordFailedUpdate,
  listUpdates,
  getUpdate,
  getCurrentVersion,
  readManifest
};
