const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  createBackup,
  createBackupSql,
  createCTBackupData,
  validateBackup,
  validateSqlBackup,
  validateCTBackupFile,
  restoreBackup,
  restoreBackupSql,
  listBackups,
  getBackupFile,
  deleteBackup,
  saveBackup,
  saveCTBackupFile,
  loadCTBackupFile,
  getCTBackupMetadata
} = require('../services/backupService');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const logAudit = require('../services/auditService');

// Configure multer for backup uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.sql') || file.originalname.endsWith('.CTBackup')) {
      cb(null, true);
    } else {
      cb(new Error('Only .sql and .CTBackup files are allowed'));
    }
  }
});

const RESTORE_JOB_TTL_MS = 24 * 60 * 60 * 1000;
const restoreJobs = new Map();

function cleanupRestoreJobs() {
  const now = Date.now();
  for (const [jobId, job] of restoreJobs.entries()) {
    if (!job.finishedAt) continue;
    if (now - job.finishedAt > RESTORE_JOB_TTL_MS) {
      restoreJobs.delete(jobId);
    }
  }
}

async function performRestore({ backup, sql, filename, force, req }) {
  let sqlContent = sql;
  let ctBackup = null;

  // Load backup from file if filename provided
  if (filename && !sqlContent && !backup) {
    const backupData = await getBackupFile(filename);
    
    // Check if it's a CTBackup or SQL
    if (typeof backupData === 'object' && backupData.format === 'CTBackup') {
      ctBackup = backupData;
    } else if (typeof backupData === 'string') {
      sqlContent = backupData;
    } else {
      // Try to treat it as JSON backup
      backup = backupData;
    }
  }

  if (!backup && !sqlContent && !ctBackup) {
    throw new Error('No backup data provided');
  }

  // Validate CTBackup if provided
  if (!force && ctBackup) {
    try {
      const report = await validateCTBackupFile(ctBackup);
      if (!report.isValid || report.errors.length > 0) {
        const err = new Error('CTBackup validation failed. Send force: true to proceed anyway.');
        err.code = 'RESTORE_VALIDATION_REQUIRED';
        err.report = report;
        throw err;
      }
    } catch (validateErr) {
      if (validateErr.code === 'RESTORE_VALIDATION_REQUIRED') {
        throw validateErr;
      }
      throw new Error('CTBackup validation error: ' + validateErr.message);
    }
  }

  // Validate regular backup if provided
  if (!force && backup) {
    try {
      const report = await validateBackup(backup);
      if (report.errors.length > 0 || report.warnings.length > 0) {
        const err = new Error('Backup validation found issues. Send force: true to proceed anyway.');
        err.code = 'RESTORE_VALIDATION_REQUIRED';
        err.report = report;
        throw err;
      }
    } catch (validateErr) {
      if (validateErr.code === 'RESTORE_VALIDATION_REQUIRED') {
        throw validateErr;
      }
      throw new Error('Validation failed: ' + validateErr.message);
    }
  }

  console.log('='.repeat(80));
  console.log('🔄 RESTORE OPERATION STARTED');
  console.log('='.repeat(80));
  console.log('📝 User ID for audit:', req.user?.id);
  console.log('📝 Authenticated user:', req.user);
  console.log('📝 Backup type:', ctBackup ? 'CTBackup' : (sqlContent ? 'SQL' : 'JSON'));
  if (filename) {
    console.log('📝 Restore filename:', filename);
  }

  // Perform restore based on backup type
  let result;
  if (ctBackup) {
    result = await restoreBackup(ctBackup);
  } else if (sqlContent) {
    result = await restoreBackupSql(sqlContent);
  } else {
    result = await restoreBackup(backup);
  }

  console.log('='.repeat(80));
  console.log('✅ RESTORE COMPLETED SUCCESSFULLY');
  console.log('✅ Result:', result);
  console.log('='.repeat(80));

  try {
    await logAudit({
      table_name: 'system',
      record_id: 0,
      action: 'BACKUP_RESTORE',
      old_data: null,
      new_data: { success: true, timestamp: new Date(), filename: filename || null },
      changed_by: req.user.id,
      req
    });
    console.log('✅ Audit log: BACKUP_RESTORE recorded');
  } catch (auditErr) {
    console.error('⚠️ Audit logging failed (non-fatal):', auditErr.message);
  }

  return {
    success: true,
    message: 'Backup restored successfully',
    ...result
  };
}

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
      const result = await saveBackup(sqlBackup);
      console.log(`✅ Backup saved as ${result.filename}`);
      
      if (result.deletedOldest) {
        console.log(`🗑️ Deleted oldest backup: ${result.deletedOldest}`);
      }
      
      // Log to audit trail (don't block the response)
      try {
        await logAudit({
          table_name: 'system',
          record_id: 0,
          action: 'BACKUP_CREATE',
          old_data: null,
          new_data: { filename: result.filename, timestamp: new Date() },
          changed_by: req.user.id,
          req
        });
        console.log('✅ Audit log: BACKUP_CREATE recorded');
      } catch (auditErr) {
        console.error('⚠️ Audit logging failed (non-fatal):', auditErr.message);
      }
      
      res.json({ 
        success: true, 
        filename: result.filename,
        deletedOldest: result.deletedOldest,
        isAtLimit: result.isAtLimit,
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
   CREATE ADVANCED BACKUP (SUPER ADMIN ONLY)
   Creates a CTBackup with compression, validation, and signatures
   ====================================================== */
router.post(
  '/create-advanced',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      console.log('📦 Creating advanced CTBackup with compression and validation...');
      
      // Create the data with CTBackup formatting
      const ctBackupData = await createCTBackupData(req.user);
      
      // Save backup to disk with compression and limit management
      const result = await saveCTBackupFile(ctBackupData);
      console.log(`✅ Advanced backup saved as ${result.filename}`);
      console.log(`📊 Compression: ${result.originalSize} → ${result.size} bytes (${result.compressionRatio}% reduction)`);
      
      if (result.deletedOldest) {
        console.log(`🗑️ Deleted oldest backup: ${result.deletedOldest}`);
      }
      
      // Log to audit trail (don't block the response)
      try {
        await logAudit({
          table_name: 'system',
          record_id: 0,
          action: 'BACKUP_CREATE_ADVANCED',
          old_data: null,
          new_data: { 
            filename: result.filename, 
            timestamp: new Date(),
            format: 'CTBackup',
            compressionRatio: result.compressionRatio
          },
          changed_by: req.user.id,
          req
        });
        console.log('✅ Audit log: BACKUP_CREATE_ADVANCED recorded');
      } catch (auditErr) {
        console.error('⚠️ Audit logging failed (non-fatal):', auditErr.message);
      }
      
      res.json({ 
        success: true, 
        filename: result.filename,
        format: 'CTBackup',
        size: result.size,
        originalSize: result.originalSize,
        compressionRatio: result.compressionRatio,
        deletedOldest: result.deletedOldest,
        isAtLimit: result.isAtLimit,
        message: 'Advanced backup created and saved successfully'
      });
    } catch (err) {
      console.error('❌ Advanced backup error:', err);
      res
        .status(500)
        .json({ error: 'Failed to create advanced backup: ' + err.message });
    }
  }
);

/* ======================================================
   CREATE ADVANCED CTBACKUP (SUPER ADMIN ONLY)
   Creates secure backup with metadata, checksums, and signatures
   ====================================================== */
router.post(
  '/create-advanced',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      console.log('📦 Creating advanced CTBackup...');
      const ctBackup = await createCTBackupData({
        id: req.user.id,
        username: req.user.username
      });
      
      // Save CTBackup to disk
      const result = await saveCTBackupFile(ctBackup);
      console.log(`✅ CTBackup saved as ${result.filename}`);
      console.log(`📊 Compression: ${result.originalSize} → ${result.size} bytes (${result.compressionRatio}% smaller)`);
      
      if (result.deletedOldest) {
        console.log(`🗑️ Deleted oldest backup: ${result.deletedOldest}`);
      }
      
      // Log to audit trail (don't block the response)
      try {
        await logAudit({
          table_name: 'system',
          record_id: 0,
          action: 'BACKUP_CREATE_ADVANCED',
          old_data: null,
          new_data: { 
            filename: result.filename, 
            timestamp: new Date(),
            totalRecords: ctBackup.metadata.totalRecords,
            tableCount: Object.keys(ctBackup.tables).length
          },
          changed_by: req.user.id,
          req
        });
        console.log('✅ Audit log: BACKUP_CREATE_ADVANCED recorded');
      } catch (auditErr) {
        console.error('⚠️ Audit logging failed (non-fatal):', auditErr.message);
      }
      
      res.json({ 
        success: true, 
        filename: result.filename,
        format: 'CTBackup',
        size: result.size,
        originalSize: result.originalSize,
        compressionRatio: result.compressionRatio,
        totalRecords: ctBackup.metadata.totalRecords,
        deletedOldest: result.deletedOldest,
        isAtLimit: result.isAtLimit,
        message: 'Advanced backup created successfully'
      });
    } catch (err) {
      console.error('❌ Advanced backup error:', err);
      res
        .status(500)
        .json({ error: 'Failed to create advanced backup: ' + err.message });
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
   VALIDATE SQL BACKUP (SUPER ADMIN ONLY)
   Analyzes SQL backup content against current schema
   ====================================================== */
router.post(
  '/validate-sql',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { sql } = req.body;

      if (!sql) {
        return res
          .status(400)
          .json({ error: 'No SQL backup provided' });
      }

      console.log('📋 Validating SQL backup...');
      const report = await validateSqlBackup(sql);
      
      res.json({ 
        success: true, 
        report 
      });
    } catch (err) {
      console.error('❌ SQL validation error:', err);
      res
        .status(500)
        .json({ error: 'Failed to validate SQL backup: ' + err.message });
    }
  }
);

/* ======================================================
   VALIDATE CTBACKUP (SUPER ADMIN ONLY)
   Full validation including checksums and signatures
   ====================================================== */
router.post(
  '/validate-ctbackup',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { ctbackup } = req.body;

      if (!ctbackup) {
        return res
          .status(400)
          .json({ error: 'No CTBackup provided' });
      }

      console.log('📋 Validating CTBackup...');
      const report = await validateCTBackupFile(ctbackup);
      
      res.json({ 
        success: true, 
        report 
      });
    } catch (err) {
      console.error('❌ CTBackup validation error:', err);
      res
        .status(500)
        .json({ error: 'Failed to validate CTBackup: ' + err.message });
    }
  }
);

/* ======================================================
   RESTORE BACKUP (SUPER ADMIN ONLY)
   ====================================================== */
router.post(
  '/restore/start',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      cleanupRestoreJobs();

      const { backup, sql, filename, force } = req.body;
      const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const startedAt = Date.now();

      restoreJobs.set(jobId, {
        id: jobId,
        status: 'running',
        message: 'Restore started',
        startedAt,
        finishedAt: null,
        filename: filename || null,
        error: null,
        result: null
      });

      const requestForJob = {
        ...req,
        user: req.user
      };

      (async () => {
        try {
          const result = await performRestore({ backup, sql, filename, force, req: requestForJob });
          const existing = restoreJobs.get(jobId);
          if (!existing) return;

          restoreJobs.set(jobId, {
            ...existing,
            status: 'completed',
            message: 'Restore completed successfully',
            finishedAt: Date.now(),
            result,
            error: null
          });
        } catch (err) {
          const existing = restoreJobs.get(jobId);
          if (!existing) return;

          try {
            await logAudit({
              table_name: 'system',
              record_id: 0,
              action: 'BACKUP_RESTORE',
              old_data: null,
              new_data: { success: false, error: err.message, timestamp: new Date(), filename: filename || null },
              changed_by: req.user.id,
              req: requestForJob
            });
          } catch (auditErr) {
            console.error('⚠️ Audit logging failed:', auditErr.message);
          }

          restoreJobs.set(jobId, {
            ...existing,
            status: 'failed',
            message: 'Restore failed',
            finishedAt: Date.now(),
            error: err.message,
            result: null
          });
          console.error('❌ Async restore job failed:', err.message);
        }
      })();

      res.status(202).json({
        success: true,
        jobId,
        status: 'running',
        message: 'Restore started in background'
      });
    } catch (err) {
      console.error('❌ Restore start error:', err);
      res.status(500).json({ error: 'Failed to start restore: ' + err.message });
    }
  }
);

router.get(
  '/restore/status/:jobId',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    cleanupRestoreJobs();

    const { jobId } = req.params;
    const job = restoreJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Restore job not found' });
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        message: job.message,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        filename: job.filename,
        error: job.error,
        result: job.result
      }
    });
  }
);

router.post(
  '/restore',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { backup, sql, filename, force } = req.body;
      const response = await performRestore({ backup, sql, filename, force, req });
      console.log('📤 Sending restore response:', response);
      res.json(response);
    } catch (err) {
      console.error('❌ Restore error:', err);

      if (err.code === 'RESTORE_VALIDATION_REQUIRED') {
        return res.status(400).json({
          success: false,
          requiresConfirmation: true,
          report: err.report,
          message: err.message
        });
      }
      
      // Try to log the error to audit trail
      try {
        await logAudit({
          table_name: 'system',
          record_id: 0,
          action: 'BACKUP_RESTORE',
          old_data: null,
          new_data: { success: false, error: err.message, timestamp: new Date() },
          changed_by: req.user.id,
          req
        });
      } catch (auditErr) {
        console.error('⚠️ Audit logging failed:', auditErr.message);
      }
      
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
      
      // Log to audit trail (don't block the response)
      try {
        await logAudit({
          table_name: 'system',
          record_id: 0,
          action: 'BACKUP_DELETE',
          old_data: { filename },
          new_data: null,
          changed_by: req.user.id,
          req
        });
        console.log('✅ Audit log: BACKUP_DELETE recorded');
      } catch (auditErr) {
        console.error('⚠️ Audit logging failed (non-fatal):', auditErr.message);
      }
      
      res.json(result);
    } catch (err) {
      console.error('❌ Delete backup error:', err);
      res.status(404).json({ error: err.message || 'Backup not found' });
    }
  }
);

/* ======================================================
   UPLOAD BACKUP (SUPER ADMIN ONLY)
   Supports both SQL and CTBackup formats
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
      
      const filename = req.file.originalname;
      let result;

      // Handle CTBackup format
      if (filename.endsWith('.CTBackup')) {
        console.log('📦 Processing CTBackup upload...');
        const ctBackupJson = req.file.buffer.toString('utf-8');
        const ctBackup = JSON.parse(ctBackupJson);
        result = await saveCTBackupFile(ctBackup);
      } else {
        // Handle SQL format
        console.log('📦 Processing SQL backup upload...');
        const sqlContent = req.file.buffer.toString('utf-8');
        result = await saveBackup(sqlContent);
      }
      
      // Log to audit trail (don't block the response)
      try {
        await logAudit({
          table_name: 'system',
          record_id: 0,
          action: 'BACKUP_UPLOAD',
          old_data: null,
          new_data: { 
            filename: result.filename, 
            timestamp: new Date(),
            format: filename.endsWith('.CTBackup') ? 'CTBackup' : 'SQL'
          },
          changed_by: req.user.id,
          req
        });
        console.log('✅ Audit log: BACKUP_UPLOAD recorded');
      } catch (auditErr) {
        console.error('⚠️ Audit logging failed (non-fatal):', auditErr.message);
      }
      
      res.json({ 
        success: true, 
        filename: result.filename,
        format: filename.endsWith('.CTBackup') ? 'CTBackup' : 'SQL',
        size: result.size,
        deletedOldest: result.deletedOldest,
        isAtLimit: result.isAtLimit,
        message: 'Backup uploaded successfully'
      });
    } catch (err) {
      console.error('❌ Upload backup error:', err);
      res.status(500).json({ error: 'Failed to upload backup: ' + err.message });
    }
  }
);

module.exports = router;
