const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const logAudit = require('../services/auditService');
const {
  createUpdatePackage,
  analyzeUpdatePackage,
  applyUpdatePackage,
  loadStoredManifest
} = require('../services/updateService');
const { exec } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Multer: accept .ctupdate files in memory (max 100MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.ctupdate')) {
      cb(null, true);
    } else {
      cb(new Error('Only .ctupdate files are allowed'));
    }
  }
});

// GET /updates/environment — return current environment info
router.get(
  '/environment',
  authenticate,
  authorizeRoles('super_admin'),
  (req, res) => {
    const env = process.env.NODE_ENV || 'development';
    const manifest = loadStoredManifest();
    res.json({
      environment: env,
      isDev: env !== 'production',
      isProd: env === 'production',
      currentVersion: manifest?.version || 'unknown',
      manifestDate: manifest?.createdAt || null
    });
  }
);

// POST /updates/create-package — create update package (DEV only)
router.post(
  '/create-package',
  authenticate,
  authorizeRoles('super_admin'),
  (req, res) => {
    const env = process.env.NODE_ENV || 'development';
    if (env === 'production') {
      return res.status(403).json({ error: 'Update packages can only be created in development mode' });
    }

    try {
      const updatePackage = createUpdatePackage();

      if (updatePackage.noChanges) {
        return res.json({ noChanges: true, message: 'No changes detected since last update package' });
      }

      // Convert to downloadable buffer
      const jsonString = JSON.stringify(updatePackage);
      const buffer = Buffer.from(jsonString, 'utf8');

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="costtracker-update-${updatePackage.version}.ctupdate"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);

      // Audit log
      logAudit({
        table_name: 'system_updates',
        record_id: 0,
        action: 'CREATE',
        old_data: null,
        new_data: {
          version: updatePackage.version,
          added: updatePackage.changes.added.length,
          modified: updatePackage.changes.modified.length,
          removed: updatePackage.changes.removed.length
        },
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Audit log failed:', err));

    } catch (err) {
      console.error('Failed to create update package:', err);
      res.status(500).json({ error: 'Failed to create update package', details: err.message });
    }
  }
);

// POST /updates/analyze — analyze an uploaded update package (PROD)
router.post(
  '/analyze',
  authenticate,
  authorizeRoles('super_admin'),
  upload.single('updateFile'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No update file provided' });
      }

      const updateData = JSON.parse(req.file.buffer.toString('utf8'));

      if (updateData.type !== 'CostTrackerUpdate') {
        return res.status(400).json({ error: 'Invalid update file format' });
      }

      const analysis = analyzeUpdatePackage(updateData);
      res.json(analysis);
    } catch (err) {
      console.error('Failed to analyze update:', err);
      res.status(500).json({ error: 'Failed to analyze update file', details: err.message });
    }
  }
);

// POST /updates/apply — apply an uploaded update package (PROD)
router.post(
  '/apply',
  authenticate,
  authorizeRoles('super_admin'),
  upload.single('updateFile'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No update file provided' });
      }

      const updateData = JSON.parse(req.file.buffer.toString('utf8'));

      if (updateData.type !== 'CostTrackerUpdate') {
        return res.status(400).json({ error: 'Invalid update file format' });
      }

      const results = applyUpdatePackage(updateData);

      // Audit log
      logAudit({
        table_name: 'system_updates',
        record_id: 0,
        action: 'UPDATE',
        old_data: { version: loadStoredManifest()?.version },
        new_data: {
          version: updateData.version,
          applied: results.applied.length,
          removed: results.removed.length,
          errors: results.errors.length
        },
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Audit log failed:', err));

      res.json({
        success: results.errors.length === 0,
        version: updateData.version,
        applied: results.applied,
        removed: results.removed,
        packageJsonUpdated: results.packageJsonUpdated || false,
        errors: results.errors
      });
    } catch (err) {
      console.error('Failed to apply update:', err);
      res.status(500).json({ error: 'Failed to apply update', details: err.message });
    }
  }
);

// POST /updates/restart — restart the app (PROD)
router.post(
  '/restart',
  authenticate,
  authorizeRoles('super_admin'),
  (req, res) => {
    // Audit log before restart
    logAudit({
      table_name: 'system_updates',
      record_id: 0,
      action: 'UPDATE',
      old_data: null,
      new_data: { action: 'restart' },
      changed_by: req.user.id,
      req
    }).catch(err => console.error('Audit log failed:', err));

    // Send response first, then restart
    res.json({ success: true, message: 'Server restarting...' });

    setTimeout(() => {
      console.log('🔄 Server restart requested via System Updates page');
      process.exit(0); // Process manager (PM2/systemd) will restart
    }, 500);
  }
);

// POST /updates/npm-install-restart — run npm install then restart (PROD)
router.post(
  '/npm-install-restart',
  authenticate,
  authorizeRoles('super_admin'),
  (req, res) => {
    // Audit log
    logAudit({
      table_name: 'system_updates',
      record_id: 0,
      action: 'UPDATE',
      old_data: null,
      new_data: { action: 'npm-install-restart' },
      changed_by: req.user.id,
      req
    }).catch(err => console.error('Audit log failed:', err));

    console.log('📦 Running npm install via System Updates page...');

    exec('npm install --production', { cwd: PROJECT_ROOT, timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('npm install failed:', error);
        // Don't restart if npm install failed
        return;
      }
      console.log('✅ npm install complete:', stdout);
      if (stderr) console.warn('npm install warnings:', stderr);

      console.log('🔄 Restarting after npm install...');
      setTimeout(() => {
        process.exit(0);
      }, 500);
    });

    // Respond immediately — npm install runs in background
    res.json({ success: true, message: 'Running npm install... Server will restart when complete.' });
  }
);

module.exports = router;
