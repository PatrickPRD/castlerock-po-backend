const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  createBackup,
  createBackupSql,
  validateBackup,
  restoreBackup,
  restoreBackupSql,
  listBackups,
  getBackupFile,
  deleteBackup,
  saveBackup
} = require('../services/backupService');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

// Configure multer for backup uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.sql')) {
      cb(null, true);
    } else {
      cb(new Error('Only .sql files are allowed'));
    }
  }
});

/* ======================================================
   CREATE BACKUP (SUPER ADMIN ONLY)
   ====================================================== */
router.post(
  '/create',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      console.log('📦 Creating SQL database backup...');
      const sqlBackup = await createBackupSql();
      
      // Save backup to disk
      const filename = await saveBackup(sqlBackup);
      console.log(`✅ Backup saved as ${filename}`);
      
      res.json({ 
        success: true, 
        filename,
        message: 'Backup created and saved successfully'
      });
    } catch (err) {
      console.error('❌ Backup error:', err);
      res
        .status(500)
        .json({ error: 'Failed to create backup: ' + err.message });
    }
  }
);

/* ======================================================
   VALIDATE BACKUP (SUPER ADMIN ONLY)
   Returns a report of what will be restored without actually restoring
   ====================================================== */
router.post(
  '/validate',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { backup, sql } = req.body;

      if (!backup && !sql) {
        return res
          .status(400)
          .json({ error: 'No backup data provided' });
      }

      if (sql) {
        return res.status(400).json({ 
          error: 'Validation not available for SQL backups. Please review the SQL file manually before restoring.' 
        });
      }

      console.log('📋 Validating backup...');
      const report = await validateBackup(backup);
      
      res.json({ 
        success: true, 
        report 
      });
    } catch (err) {
      console.error('❌ Validation error:', err);
      res
        .status(500)
        .json({ error: 'Failed to validate backup: ' + err.message });
    }
  }
);

/* ======================================================
   RESTORE BACKUP (SUPER ADMIN ONLY)
   ====================================================== */
router.post(
  '/restore',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { backup, sql, force } = req.body;

      if (!backup && !sql) {
        return res
          .status(400)
          .json({ error: 'No backup data provided' });
      }

      // If not forcing and backup data provided, validate first
      if (!force && backup) {
        try {
          const report = await validateBackup(backup);
          if (report.errors.length > 0 || report.warnings.length > 0) {
            return res.status(400).json({
              success: false,
              requiresConfirmation: true,
              report,
              message: 'Backup validation found issues. Review the report above. Send force: true to proceed anyway.'
            });
          }
        } catch (validateErr) {
          return res.status(400).json({
            success: false,
            requiresConfirmation: true,
            error: 'Validation failed: ' + validateErr.message,
            message: 'Send force: true to proceed without validation.'
          });
        }
      }

      console.log('🔄 Restoring database from backup...');
      const result = sql ? await restoreBackupSql(sql) : await restoreBackup(backup);

      res.json(result);
    } catch (err) {
      console.error('❌ Restore error:', err);
      res
        .status(500)
        .json({ error: 'Failed to restore backup: ' + err.message });
    }
  }
);

/* ======================================================
   LIST BACKUPS (SUPER ADMIN ONLY)
   ====================================================== */
router.get(
  '/list',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const backups = await listBackups();
      res.json({ success: true, backups });
    } catch (err) {
      console.error('❌ List backups error:', err);
      res.status(500).json({ error: 'Failed to list backups: ' + err.message });
    }
  }
);

/* ======================================================
   DOWNLOAD BACKUP (SUPER ADMIN ONLY)
   ====================================================== */
router.get(
  '/download/:filename',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { filename } = req.params;
      const content = await getBackupFile(filename);
      
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (err) {
      console.error('❌ Download backup error:', err);
      res.status(404).json({ error: err.message || 'Backup not found' });
    }
  }
);

/* ======================================================
   DELETE BACKUP (SUPER ADMIN ONLY)
   ====================================================== */
router.delete(
  '/:filename',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { filename } = req.params;
      const result = await deleteBackup(filename);
      res.json(result);
    } catch (err) {
      console.error('❌ Delete backup error:', err);
      res.status(404).json({ error: err.message || 'Backup not found' });
    }
  }
);

/* ======================================================
   UPLOAD BACKUP (SUPER ADMIN ONLY)
   ====================================================== */
router.post(
  '/upload',
  authenticate,
  authorizeRoles('super_admin'),
  upload.single('backup'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const sqlContent = req.file.buffer.toString('utf-8');
      const filename = await saveBackup(sqlContent);
      
      res.json({ 
        success: true, 
        filename,
        message: 'Backup uploaded successfully'
      });
    } catch (err) {
      console.error('❌ Upload backup error:', err);
      res.status(500).json({ error: 'Failed to upload backup: ' + err.message });
    }
  }
);

module.exports = router;
