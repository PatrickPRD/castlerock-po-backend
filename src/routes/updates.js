const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const logAudit = require('../services/auditService');
const {
  parseUpdatePackage,
  previewUpdate,
  applyUpdate,
  recordFailedUpdate,
  listUpdates,
  getUpdate,
  getCurrentVersion
} = require('../services/updateService');

// 50 MB max — update packages should be small but give headroom
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.CTUpdate')) {
      cb(null, true);
    } else {
      cb(new Error('Only .CTUpdate files are allowed'));
    }
  }
});

// All update routes: super_admin only
router.use(authenticate, authorizeRoles('super_admin'));

/* -------------------------------------------------------
   GET /updates
   List all applied / failed updates + current version
------------------------------------------------------- */
router.get('/', async (req, res) => {
  try {
    const [updates, version] = await Promise.all([listUpdates(), getCurrentVersion()]);
    res.json({ updates, currentVersion: version });
  } catch (err) {
    console.error('Error listing updates:', err);
    res.status(500).json({ error: 'Failed to retrieve update history' });
  }
});

/* -------------------------------------------------------
   GET /updates/:id
   Detail for a single update record
------------------------------------------------------- */
router.get('/:id', async (req, res) => {
  try {
    const update = await getUpdate(req.params.id);
    if (!update) return res.status(404).json({ error: 'Update record not found' });
    res.json(update);
  } catch (err) {
    console.error('Error fetching update:', err);
    res.status(500).json({ error: 'Failed to retrieve update record' });
  }
});

/* -------------------------------------------------------
   POST /updates/preview
   Upload a .CTUpdate file and return a preview without applying.
------------------------------------------------------- */
router.post('/preview', upload.single('updateFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No update file uploaded' });
  }

  try {
    const pkg = await parseUpdatePackage(req.file.buffer);
    pkg._filename = req.file.originalname;
    const preview = await previewUpdate(pkg);

    // Store the parsed package temporarily in session-like memory on the response
    // so the apply endpoint can reuse it without re-uploading.
    // We encode it back to a minimal token the client echoes in /apply.
    // For simplicity and security we send the full validated JSON back — the
    // client re-submits it in the apply call so the server re-validates fully.
    res.json({
      preview,
      packageJson: JSON.stringify(pkg)
    });
  } catch (err) {
    console.error('Error previewing update:', err);
    res.status(400).json({ error: err.message });
  }
});

/* -------------------------------------------------------
   POST /updates/apply
   Apply a previously-parsed update package.
   Body: { packageJson: "<serialised pkg>" }
------------------------------------------------------- */
router.post('/apply', async (req, res) => {
  const { packageJson } = req.body;
  if (!packageJson) {
    return res.status(400).json({ error: 'packageJson is required' });
  }

  let rawPkg;
  try {
    rawPkg = JSON.parse(packageJson);
  } catch {
    return res.status(400).json({ error: 'Invalid packageJson' });
  }

  let pkg;
  try {
    // Re-validate the full package — never trust client data blindly
    pkg = await parseUpdatePackage(Buffer.from(packageJson));
  } catch (err) {
    await recordFailedUpdate(rawPkg, rawPkg._filename || 'unknown', req.user.id, err.message);
    return res.status(400).json({ error: err.message });
  }

  try {
    const result = await applyUpdate(pkg, req.user.id);

    await logAudit(req, 'SYSTEM_UPDATE_APPLIED', 'system_updates', null, {
      version: pkg.version,
      filename: pkg._filename,
      filesApplied: result.applied.length,
      filesSkipped: result.skipped.length
    });

    res.json({
      message: `Update ${pkg.version} applied successfully`,
      applied: result.applied,
      skipped: result.skipped
    });
  } catch (err) {
    console.error('Error applying update:', err);
    await recordFailedUpdate(pkg, pkg._filename || 'unknown', req.user.id, err.message);

    await logAudit(req, 'SYSTEM_UPDATE_FAILED', 'system_updates', null, {
      version: pkg.version,
      error: err.message
    });

    res.status(500).json({ error: `Update failed: ${err.message}` });
  }
});

module.exports = router;
