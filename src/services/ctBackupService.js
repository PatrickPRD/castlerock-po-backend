/**
 * Advanced CTBackup Format Service
 * Provides secure, validated backup and restore functionality
 * Format: .CTBackup (JSON with metadata, checksums, and signatures)
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const storage = require('./backupStorageService');

// Get backup secret from environment (should be set in .env)
const BACKUP_SECRET = process.env.BACKUP_SECRET || 'default-insecure-secret-change-me';
const BACKUP_VERSION = '2.0';
const BACKUP_FORMAT = 'CTBackup';
const BACKUP_DIR = path.join(__dirname, '../../backups');

/**
 * Calculate SHA256 hash of data
 */
function calculateHash(data) {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}

/**
 * Calculate HMAC signature for backup integrity
 */
function calculateSignature(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

/**
 * Verify HMAC signature
 */
function verifySignature(data, signature, secret) {
  const expectedSignature = calculateSignature(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Create a structured CTBackup file with metadata and validation
 * @param {Object} backupData - Data with metadata and tables
 * @param {Object} user - User creating the backup
 * @returns {Promise<Object>} The backup structure
 */
async function createCTBackup(backupData, user = {}) {
  try {
    // Calculate table checksums
    const tableChecksums = {};
    let totalRecords = 0;

    for (const [tableName, rows] of Object.entries(backupData.tables || {})) {
      const tableJson = JSON.stringify(rows);
      tableChecksums[tableName] = {
        rowCount: rows.length,
        checksum: calculateHash(tableJson)
      };
      totalRecords += rows.length;
    }

    // Create backup structure
    const backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      metadata: {
        createdAt: new Date().toISOString(),
        createdBy: {
          userId: user.id || null,
          username: user.username || 'system'
        },
        database: process.env.DB_NAME || 'castlerock_po',
        appVersion: process.env.APP_VERSION || '1.0.0',
        tables: tableChecksums,
        totalRecords,
        source: 'backup_system'
      },
      tables: backupData.tables || {}
    };

    // Calculate total data checksum
    const dataForChecksum = JSON.stringify(backup.tables);
    backup.metadata.totalChecksum = calculateHash(dataForChecksum);

    // Calculate signature
    const backupJson = JSON.stringify(backup);
    backup.metadata.signature = calculateSignature(backupJson, BACKUP_SECRET);

    return backup;
  } catch (err) {
    throw new Error(`Failed to create CTBackup structure: ${err.message}`);
  }
}

/**
 * Validate CTBackup integrity and structure
 * @param {Object} backup - The backup object
 * @returns {Object} Validation report
 */async function validateCTBackup(backup) {
  const report = {
    valid: true,
    version: backup.version,
    createdAt: backup.metadata?.createdAt,
    totalRecords: backup.metadata?.totalRecords || 0,
    tables: {},
    warnings: [],
    errors: [],
    checksumValidation: {
      valid: false,
      message: ''
    },
    signatureValidation: {
      valid: false,
      message: ''
    }
  };

  try {
    // Validate format
    if (backup.format !== BACKUP_FORMAT) {
      report.errors.push(`Invalid format: expected ${BACKUP_FORMAT}, got ${backup.format}`);
      report.valid = false;
      return report;
    }

    // Validate version
    if (backup.version !== BACKUP_VERSION) {
      report.warnings.push(
        `Version mismatch: backup is v${backup.version}, system is v${BACKUP_VERSION}. Restore may have issues.`
      );
    }

    // Validate metadata
    if (!backup.metadata || !backup.metadata.signature) {
      report.errors.push('Missing metadata or signature');
      report.valid = false;
      return report;
    }

    // Verify signature
    try {
      const backupJsonForSig = JSON.stringify(backup);
      verifySignature(backupJsonForSig, backup.metadata.signature, BACKUP_SECRET);
      report.signatureValidation.valid = true;
      report.signatureValidation.message = 'Signature verification passed';
    } catch (sigErr) {
      report.signatureValidation.valid = false;
      report.signatureValidation.message = 'Signature verification failed - backup may be corrupted';
      report.errors.push('Invalid backup signature');
      report.valid = false;
    }

    // Validate table checksums
    for (const [tableName, tableData] of Object.entries(backup.tables || {})) {
      const rows = tableData || [];
      const tableJson = JSON.stringify(rows);
      const calculatedChecksum = calculateHash(tableJson);
      const expectedChecksum = backup.metadata.tables[tableName]?.checksum;

      if (expectedChecksum !== calculatedChecksum) {
        report.errors.push(
          `Checksum mismatch for table '${tableName}': expected ${expectedChecksum}, got ${calculatedChecksum}`
        );
        report.valid = false;
      }

      report.tables[tableName] = {
        rowCount: rows.length,
        checksum: calculatedChecksum,
        checksumValid: expectedChecksum === calculatedChecksum
      };
    }

    // Validate total checksum
    const dataForChecksum = JSON.stringify(backup.tables);
    const calculatedTotal = calculateHash(dataForChecksum);
    if (backup.metadata.totalChecksum !== calculatedTotal) {
      report.errors.push(
        `Total checksum mismatch: expected ${backup.metadata.totalChecksum}, got ${calculatedTotal}`
      );
      report.valid = false;
    }
    report.checksumValidation.valid = backup.metadata.totalChecksum === calculatedTotal;
    report.checksumValidation.message = report.checksumValidation.valid
      ? 'All checksums valid'
      : 'Checksum validation failed';

    return report;
  } catch (err) {
    report.errors.push(`Validation error: ${err.message}`);
    report.valid = false;
    return report;
  }
}

/**
 * Save CTBackup to compressed file
 * @param {Object} backup - The backup object
 * @param {string} filename - Optional custom filename
 * @returns {Promise<Object>} Save result with metadata
 */
async function saveCTBackupFile(backup, filename = null) {
  try {
    // Generate filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);

    const backupFilename = filename || `backup_${timestamp}.CTBackup`;

    // Serialize and compress
    const jsonData = JSON.stringify(backup);
    const compressed = await gzip(jsonData);

    // Store via storage abstraction (S3 on EC2, local disk otherwise)
    await storage.saveFile(backupFilename, compressed);

    const compressedSize = compressed.length;
    const originalSize = Buffer.byteLength(jsonData);

    return {
      filename: backupFilename,
      size: compressedSize,
      originalSize,
      compressionRatio: ((1 - compressedSize / originalSize) * 100).toFixed(2),
      created: new Date(),
      type: 'ctbackup',
      storage: storage.isS3Enabled() ? 's3' : 'local'
    };
  } catch (err) {
    throw new Error(`Failed to save CTBackup file: ${err.message}`);
  }
}

/**
 * Load and decompress CTBackup file
 * @param {string} filename - Backup filename
 * @returns {Promise<Object>} Decompressed backup object
 */
async function loadCTBackupFile(filename) {
  try {
    const safeName = path.basename(filename);

    // Load via storage abstraction (S3 on EC2, local disk otherwise)
    const compressed = await storage.loadFile(safeName);
    const jsonData = await gunzip(compressed);
    const backup = JSON.parse(jsonData.toString());

    return backup;
  } catch (err) {
    throw new Error(`Failed to load CTBackup file: ${err.message}`);
  }
}

/**
 * Get backup metadata without loading full data
 * @param {string} filename - Backup filename
 * @returns {Promise<Object>} Metadata only
 */
async function getCTBackupMetadata(filename) {
  try {
    const backup = await loadCTBackupFile(filename);
    return {
      filename,
      format: backup.format,
      version: backup.version,
      metadata: backup.metadata,
      tableCount: Object.keys(backup.tables || {}).length
    };
  } catch (err) {
    throw new Error(`Failed to get backup metadata: ${err.message}`);
  }
}

module.exports = {
  createCTBackup,
  validateCTBackup,
  saveCTBackupFile,
  loadCTBackupFile,
  getCTBackupMetadata,
  calculateHash,
  calculateSignature,
  verifySignature,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_DIR
};
