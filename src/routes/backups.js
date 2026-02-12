const express = require('express');
const router = express.Router();
const {
  createBackup,
  createBackupSql,
  validateBackup,
  restoreBackup,
  restoreBackupSql
} = require('../services/backupService');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

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
      res.json({ success: true, sql: sqlBackup });
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

module.exports = router;
