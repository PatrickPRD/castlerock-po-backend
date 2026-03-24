/**
 * Backup Storage Service
 *
 * Abstracts backup file storage.
 *   - When S3_BACKUP_BUCKET is set in .env → files go to/from AWS S3.
 *     This is the expected configuration when the app runs on EC2.
 *   - Otherwise → files go to/from local disk (backups/ directory).
 *     This is the default for local development.
 *
 * No other configuration changes are needed; only .env controls the behaviour.
 * On EC2 the application uses the attached IAM role for S3 credentials, so
 * no AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are required in that environment.
 */

const fs = require('fs').promises;
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');

const BACKUP_DIR = path.join(__dirname, '../../backups');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when S3 bucket storage is configured for this environment.
 */
function isS3Enabled() {
  return !!process.env.S3_BACKUP_BUCKET;
}

/**
 * Build S3 client + config from environment.
 * Called lazily so the SDK is never exercised unless S3 is actually configured.
 */
function getS3Config() {
  if (!isS3Enabled()) return null;

  return {
    bucket: process.env.S3_BACKUP_BUCKET,
    prefix: process.env.S3_BACKUP_PREFIX || 'backups/',
    client: new S3Client({ region: process.env.AWS_REGION || 'eu-west-1' })
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upload / write a backup file.
 * @param {string} filename - Bare filename (no directory path).
 * @param {Buffer|string} content - File content (Buffer for .CTBackup, string for .sql).
 */
async function saveFile(filename, content) {
  const s3 = getS3Config();

  if (s3) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    await s3.client.send(new PutObjectCommand({
      Bucket: s3.bucket,
      Key: `${s3.prefix}${filename}`,
      Body: buffer,
      ContentType: filename.endsWith('.CTBackup') ? 'application/octet-stream' : 'text/plain'
    }));
    console.log(`☁️  Backup saved to S3: s3://${s3.bucket}/${s3.prefix}${filename}`);
    return;
  }

  // Local fallback
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const filePath = path.join(BACKUP_DIR, path.basename(filename));
  if (Buffer.isBuffer(content)) {
    await fs.writeFile(filePath, content);
  } else {
    await fs.writeFile(filePath, content, 'utf-8');
  }
}

/**
 * Download / read a backup file.
 * @param {string} filename - Bare filename.
 * @returns {Promise<Buffer>} Raw file bytes.
 */
async function loadFile(filename) {
  const safeName = path.basename(filename);
  const s3 = getS3Config();

  if (s3) {
    const response = await s3.client.send(new GetObjectCommand({
      Bucket: s3.bucket,
      Key: `${s3.prefix}${safeName}`
    }));
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // Local fallback
  const filePath = path.join(BACKUP_DIR, safeName);
  return await fs.readFile(filePath);
}

/**
 * List all backup files available in the configured storage.
 * @returns {Promise<Array<{filename: string, size: number, created: Date}>>}
 */
async function listFiles() {
  const s3 = getS3Config();

  if (s3) {
    const response = await s3.client.send(new ListObjectsV2Command({
      Bucket: s3.bucket,
      Prefix: s3.prefix
    }));
    return (response.Contents || []).map(obj => ({
      filename: path.basename(obj.Key),
      size: obj.Size,
      created: obj.LastModified
    }));
  }

  // Local fallback
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const files = await fs.readdir(BACKUP_DIR);
  const results = [];
  for (const file of files) {
    if (!file.endsWith('.sql') && !file.endsWith('.CTBackup')) continue;
    const filePath = path.join(BACKUP_DIR, file);
    const stats = await fs.stat(filePath);
    results.push({ filename: file, size: stats.size, created: stats.mtime });
  }
  return results;
}

/**
 * Delete a backup file.
 * @param {string} filename - Bare filename.
 */
async function deleteFile(filename) {
  const safeName = path.basename(filename);
  const s3 = getS3Config();

  if (s3) {
    await s3.client.send(new DeleteObjectCommand({
      Bucket: s3.bucket,
      Key: `${s3.prefix}${safeName}`
    }));
    console.log(`🗑️  Backup deleted from S3: ${safeName}`);
    return;
  }

  // Local fallback
  const filePath = path.join(BACKUP_DIR, safeName);
  await fs.access(filePath);
  await fs.unlink(filePath);
}

/**
 * Check whether a backup file exists in the configured storage.
 * @param {string} filename - Bare filename.
 * @returns {Promise<boolean>}
 */
async function fileExists(filename) {
  const safeName = path.basename(filename);
  const s3 = getS3Config();

  if (s3) {
    try {
      await s3.client.send(new HeadObjectCommand({
        Bucket: s3.bucket,
        Key: `${s3.prefix}${safeName}`
      }));
      return true;
    } catch (err) {
      if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound' || err.name === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }

  // Local fallback
  const filePath = path.join(BACKUP_DIR, safeName);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { isS3Enabled, saveFile, loadFile, listFiles, deleteFile, fileExists };
