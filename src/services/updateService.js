const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Directories/files tracked for updates
const TRACKED_PATTERNS = [
  'src/',
  'public/',
  'database/migrations/',
  'package.json'
];

// Directories/files excluded from update packages
const EXCLUDED = [
  'node_modules',
  '.git',
  '.env',
  'backups/',
  'uploads/',
  'update-manifest.json'
];

/**
 * Compute SHA-256 hash of file contents
 */
function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Recursively collect all files under a directory
 */
function walkDir(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (EXCLUDED.some(ex => relativePath.startsWith(ex) || entry.name === ex)) continue;

    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath, baseDir));
    } else {
      results.push({ fullPath, relativePath: path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/') });
    }
  }
  return results;
}

/**
 * Get all tracked files in the project
 */
function getTrackedFiles() {
  const files = [];
  for (const pattern of TRACKED_PATTERNS) {
    const fullPath = path.join(PROJECT_ROOT, pattern);
    if (fs.statSync(fullPath, { throwIfNoEntry: false })?.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (fs.existsSync(fullPath)) {
      files.push({
        fullPath,
        relativePath: pattern
      });
    }
  }
  return files;
}

/**
 * Build a manifest of current file hashes
 */
function buildCurrentManifest() {
  const files = getTrackedFiles();
  const manifest = {};
  for (const file of files) {
    manifest[file.relativePath] = hashFile(file.fullPath);
  }
  return manifest;
}

/**
 * Load the stored update manifest (if any)
 */
function loadStoredManifest() {
  const manifestPath = path.join(PROJECT_ROOT, 'update-manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Save current manifest to disk
 */
function saveManifest(manifest, version) {
  const manifestPath = path.join(PROJECT_ROOT, 'update-manifest.json');
  const data = {
    version,
    createdAt: new Date().toISOString(),
    files: manifest
  };
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2));
  return data;
}

/**
 * Create an update package (DEV only)
 * Creates a JSON bundle containing all changed/new files since last manifest
 */
function createUpdatePackage() {
  const storedManifest = loadStoredManifest();
  const currentManifest = buildCurrentManifest();
  const oldFiles = storedManifest?.files || {};

  const changes = { added: [], modified: [], removed: [] };
  const fileContents = {};

  // Find added and modified files
  for (const [filePath, hash] of Object.entries(currentManifest)) {
    if (!oldFiles[filePath]) {
      changes.added.push(filePath);
      fileContents[filePath] = fs.readFileSync(path.join(PROJECT_ROOT, filePath)).toString('base64');
    } else if (oldFiles[filePath] !== hash) {
      changes.modified.push(filePath);
      fileContents[filePath] = fs.readFileSync(path.join(PROJECT_ROOT, filePath)).toString('base64');
    }
  }

  // Find removed files
  for (const filePath of Object.keys(oldFiles)) {
    if (!currentManifest[filePath]) {
      changes.removed.push(filePath);
    }
  }

  const totalChanges = changes.added.length + changes.modified.length + changes.removed.length;
  if (totalChanges === 0) {
    return { noChanges: true };
  }

  // Generate version from timestamp
  const now = new Date();
  const version = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  // Save updated manifest
  saveManifest(currentManifest, version);

  const updatePackage = {
    type: 'CostTrackerUpdate',
    version,
    createdAt: new Date().toISOString(),
    previousVersion: storedManifest?.version || 'initial',
    changes,
    manifest: currentManifest,
    files: fileContents,
    packageDependencies: JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).dependencies || {}
  };

  return updatePackage;
}

/**
 * Analyze an update package without applying it (PROD)
 * Returns a summary of what would change
 */
function analyzeUpdatePackage(updateData) {
  const currentManifest = buildCurrentManifest();
  const currentPkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
  const currentDeps = currentPkg.dependencies || {};

  const analysis = {
    version: updateData.version,
    previousVersion: updateData.previousVersion,
    createdAt: updateData.createdAt,
    changes: {
      added: [],
      modified: [],
      removed: [],
      unchanged: []
    },
    dependencyChanges: {
      added: [],
      updated: [],
      removed: []
    },
    needsNpmInstall: false,
    totalFiles: Object.keys(updateData.files || {}).length,
    fileDetails: []
  };

  // Analyze file changes
  const incomingManifest = updateData.manifest || {};

  for (const filePath of (updateData.changes?.added || [])) {
    const existsLocally = !!currentManifest[filePath];
    analysis.changes.added.push(filePath);
    analysis.fileDetails.push({
      path: filePath,
      action: existsLocally ? 'overwrite (file already exists locally)' : 'add',
      size: updateData.files[filePath] ? Buffer.from(updateData.files[filePath], 'base64').length : 0
    });
  }

  for (const filePath of (updateData.changes?.modified || [])) {
    const localHash = currentManifest[filePath];
    const incomingHash = incomingManifest[filePath];
    if (localHash === incomingHash) {
      analysis.changes.unchanged.push(filePath);
    } else {
      analysis.changes.modified.push(filePath);
    }
    analysis.fileDetails.push({
      path: filePath,
      action: localHash === incomingHash ? 'unchanged (already up-to-date)' : 'update',
      size: updateData.files[filePath] ? Buffer.from(updateData.files[filePath], 'base64').length : 0
    });
  }

  for (const filePath of (updateData.changes?.removed || [])) {
    const existsLocally = fs.existsSync(path.join(PROJECT_ROOT, filePath));
    if (existsLocally) {
      analysis.changes.removed.push(filePath);
      analysis.fileDetails.push({
        path: filePath,
        action: 'delete',
        size: 0
      });
    }
  }

  // Analyze dependency changes
  const incomingDeps = updateData.packageDependencies || {};

  for (const [dep, ver] of Object.entries(incomingDeps)) {
    if (!currentDeps[dep]) {
      analysis.dependencyChanges.added.push({ name: dep, version: ver });
      analysis.needsNpmInstall = true;
    } else if (currentDeps[dep] !== ver) {
      analysis.dependencyChanges.updated.push({ name: dep, from: currentDeps[dep], to: ver });
      analysis.needsNpmInstall = true;
    }
  }

  for (const dep of Object.keys(currentDeps)) {
    if (!incomingDeps[dep]) {
      analysis.dependencyChanges.removed.push({ name: dep });
    }
  }

  return analysis;
}

/**
 * Apply an update package (PROD)
 * Writes files, removes deleted files, updates manifest
 */
function applyUpdatePackage(updateData) {
  const results = { applied: [], removed: [], errors: [] };

  // Write added and modified files
  for (const [filePath, contentBase64] of Object.entries(updateData.files || {})) {
    try {
      const fullPath = path.join(PROJECT_ROOT, filePath);
      const dir = path.dirname(fullPath);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const content = Buffer.from(contentBase64, 'base64');
      fs.writeFileSync(fullPath, content);
      results.applied.push(filePath);
    } catch (err) {
      results.errors.push({ file: filePath, error: err.message });
    }
  }

  // Remove deleted files
  for (const filePath of (updateData.changes?.removed || [])) {
    try {
      const fullPath = path.join(PROJECT_ROOT, filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        results.removed.push(filePath);
      }
    } catch (err) {
      results.errors.push({ file: filePath, error: err.message });
    }
  }

  // Update package.json dependencies if needed
  if (updateData.packageDependencies && Object.keys(updateData.packageDependencies).length > 0) {
    try {
      const pkgPath = path.join(PROJECT_ROOT, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.dependencies = { ...pkg.dependencies, ...updateData.packageDependencies };
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      results.packageJsonUpdated = true;
    } catch (err) {
      results.errors.push({ file: 'package.json', error: err.message });
    }
  }

  // Save new manifest
  if (updateData.manifest) {
    saveManifest(updateData.manifest, updateData.version);
  }

  return results;
}

module.exports = {
  createUpdatePackage,
  analyzeUpdatePackage,
  applyUpdatePackage,
  buildCurrentManifest,
  loadStoredManifest
};
