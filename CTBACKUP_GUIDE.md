# CTBackup Format - Advanced Backup System

## Overview

The CTBackup system is an advanced backup format that replaces raw SQL dumps with a secure, validated, and compressed backup format. It provides:

✅ **Data Integrity** - HMAC signatures and checksums validate backup authenticity
✅ **Compression** - GZip compression reduces file size by 80-90%
✅ **Metadata** - Detailed backup information including record counts, timestamps, user info
✅ **Validation** - Pre-restore validation prevents data corruption
✅ **Security** - HMAC-SHA256 signatures prevent tampering
✅ **Backward Compatible** - Old SQL backups continue to work

## File Format

The `.CTBackup` file is a compressed JSON structure with the following properties:

```json
{
  "format": "CTBackup",
  "version": "2.0",
  "metadata": {
    "createdAt": "2026-02-20T12:34:56.789Z",
    "createdBy": {
      "userId": 1,
      "username": "admin"
    },
    "database": "castlerock_po",
    "appVersion": "1.0.0",
    "tables": {
      "purchase_orders": {
        "rowCount": 150,
        "checksum": "sha256_hash_of_table_data"
      },
      ...
    },
    "totalRecords": 5000,
    "totalChecksum": "sha256_hash_of_all_tables",
    "signature": "hmac_sha256_signature"
  },
  "tables": {
    "purchase_orders": [...],
    "invoices": [...],
    ...
  }
}
```

## Setup Requirements

### 1. Set Environment Variable

Add the `BACKUP_SECRET` to your `.env` file for HMAC signing:

```bash
# Generate a secure secret (run this in Node.js console)
require('crypto').randomBytes(32).toString('hex')
# Output: abc123def456...

# Add to .env
BACKUP_SECRET=abc123def456...
```

**⚠️ Important**: Keep this secret secure - it's used to verify backup integrity.

### 2. No Database Changes Required

The CTBackup system works with your existing database. No migrations or schema updates needed.

## Usage

### Creating Backups

#### Via UI

1. Go to **Admin > Backup Management**
2. Click **Advanced Backup** button (green button with shield icon)
3. Backup is created and automatically compressed
4. Displayed with compression stats

#### Via API

```javascript
POST /backups/create-advanced
Authorization: Bearer {token}

Response:
{
  "success": true,
  "filename": "backup_2026-02-20_12-34-56.CTBackup",
  "format": "CTBackup",
  "size": 450000,
  "originalSize": 2500000,
  "compressionRatio": "82.00",
  "totalRecords": 5000,
  "message": "Advanced backup created successfully"
}
```

### Validating Backups

#### Validation Report Includes

- **Format & Version Check** - Verifies file is valid CTBackup format
- **Signature Verification** - HMAC-SHA256 validation
- **Checksum Validation** - Per-table and total data checksums
- **Table Analysis** - Record counts per table
- **Warnings** - Missing or empty tables

#### Via API

```javascript
POST /backups/validate-ctbackup
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "ctbackup": { /* CTBackup object */ }
}

Response:
{
  "success": true,
  "report": {
    "valid": true,
    "version": "2.0",
    "createdAt": "2026-02-20T12:34:56.789Z",
    "totalRecords": 5000,
    "tables": {
      "purchase_orders": {
        "rowCount": 150,
        "checksum": "...",
        "checksumValid": true
      }
    },
    "checksumValidation": {
      "valid": true,
      "message": "All checksums valid"
    },
    "signatureValidation": {
      "valid": true,
      "message": "Signature verification passed"
    },
    "warnings": [],
    "errors": []
  }
}
```

### Restoring Backups

#### Via UI

1. Go to **Admin > Backup Management**
2. Find the backup file
3. Click **Restore** button (sync icon)
4. Review validation report
5. Confirm restore (all non-user data will be replaced)

#### Via API

```javascript
POST /backups/restore/start
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "filename": "backup_2026-02-20_12-34-56.CTBackup",
  "force": false  // Set true to skip validation
}

Response:
{
  "success": true,
  "jobId": "1708930496000_abc123def",
  "status": "running",
  "message": "Restore started in background"
}

// Check restore progress
GET /backups/restore/status/{jobId}
```

## Comparison: SQL vs CTBackup

| Feature | SQL Backup | CTBackup |
|---------|-----------|----------|
| **Format** | Raw SQL INSERT statements | Compressed JSON |
| **File Size** | 2-5 MB | 0.5-1 MB (80% smaller) |
| **Validation** | Minimal | Full integrity checks |
| **Checksums** | None | Per-table + total |
| **Signing** | None | HMAC-SHA256 |
| **Metadata** | Comments only | Rich metadata |
| **Compression** | None | GZip |
| **Record Count** | Must parse | Included in metadata |
| **Security** | Tamper-able | Cryptographically signed |
| **Speed** | Slower | Faster (compressed) |

## File Size Examples

### Before (SQL Format)
```
backup_2026-02-20_10-00-00.sql     2.8 MB
backup_2026-02-20_11-00-00.sql     2.8 MB
backup_2026-02-20_12-00-00.sql     2.8 MB
Total: 8.4 MB for 3 backups
```

### After (CTBackup Format)  
```
backup_2026-02-20_10-00-00.CTBackup   0.54 MB
backup_2026-02-20_11-00-00.CTBackup   0.54 MB
backup_2026-02-20_12-00-00.CTBackup   0.54 MB
Total: 1.62 MB for 3 backups (81% space savings)
```

## Migration Path

### You Can:

✅ Create new backups in CTBackup format
✅ Upload existing SQL backups (still works)
✅ Upload CTBackup files
✅ Restore from either format
✅ Mix both formats in your backup directory

### Recommended:

1. **Continue using SQL backups** if that's working for you
2. **Start creating CTBackup files** for new backups
3. **Gradually move** to CTBackup as your primary format
4. **Convert old backups** manually if desired

## Backup Limit Management

The system maintains a maximum of 20 backups. When creating a new backup:

- If under 20 backups → Save normally
- If at 20 backups → Delete oldest and save new
- Works identically for both SQL and CTBackup formats

## Error Handling

### Common Errors

#### "Invalid CTBackup: empty file"
- File is corrupted or empty
- Re-generate backup

#### "Signature verification failed"
- `BACKUP_SECRET` changed
- Backup was manually edited
- Cannot restore - integrity compromised

#### "Checksum mismatch for table 'X'"
- Table data corrupted during storage
- Backup file corrupted
- Cannot restore - try different backup

#### "Version mismatch"
- Warning only
- Backup was created with different app version
- Usually can still restore

### Force Restore

If validation fails but you want to restore anyway:

```javascript
POST /backups/restore/start
Authorization: Bearer {token}
Content-Type: application/json

Body:
{
  "filename": "backup_2026-02-20_12-34-56.CTBackup",
  "force": true  // Skip validation
}
```

## Audit Trail

All backup operations are logged to the audit trail:

```sql
SELECT * FROM audit_log WHERE action LIKE 'BACKUP_%';

Actions:
- BACKUP_CREATE → SQL backup created
- BACKUP_CREATE_ADVANCED → CTBackup created
- BACKUP_UPLOAD → Backup file uploaded
- BACKUP_RESTORE → Backup restored
```

## Troubleshooting

### Backup not appearing in list
- Check `/backups/` directory exists
- Verify file has `.CTBackup` or `.sql` extension
- Check file permissions

### Restore taking too long
- Large backups (5000+ records) may take 1-2 minutes
- Check server logs for errors
- Query `/backups/restore/status/{jobId}` to monitor

### Signature verification fails
- Verify `BACKUP_SECRET` in `.env` hasn't changed
- Confirm backup file hasn't been edited
- Try uploading fresh backup

### Out of disk space
- Delete old backups via UI or filesystem
- Max 20 backups are kept automatically
- Each backup is ~0.5-2.8 MB

## Technical Details

### Checksums Used
- Algorithm: SHA-256
- Per-table: Hash of JSON table data
- Total: Hash of all table data combined
- Validation: Recalculate and compare on restore

### Signature Algorithm
- Type: HMAC-SHA256
- Key: `BACKUP_SECRET` from environment
- Input: Entire backup JSON
- Verification: Crypto timing-safe comparison

### Compression
- Algorithm: GZip (zlib)
- Level: Default (6)
- Ratio: 80-90% for typical data

## Best Practices

1. **Backup Regularly**
   - Create backups daily/weekly
   - Use CTBackup for new backups
   - Keep 5-10 recent backups

2. **Test Restores**
   - Monthly: Restore a backup to test environment
   - Verify data integrity after restore
   - Document restore procedure

3. **Secure the Secret**
   - Store `BACKUP_SECRET` securely
   - Rotate if suspected compromise
   - Don't commit to Git

4. **Monitor Backups**
   - Check audit trail for BACKUP_* actions
   - Alert on backup failures
   - Verify backup file sizes normal

5. **Keep Both Formats**
   - SQL backups: Easy file review
   - CTBackup: Secure, compressed storage
   - Use CTBackup as primary

## API Examples

### Complete Workflow

```javascript
// 1. Create advanced backup
const createRes = await fetch('/backups/create-advanced', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token }
});
const backup = await createRes.json();
console.log('Created:', backup.filename);

// 2. Validate backup (when restoring)
const valRes = await fetch('/backups/validate-ctbackup', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token },
  body: JSON.stringify({ ctbackup: backupData })
});
const validation = await valRes.json();
if (!validation.report.valid) {
  console.error('Validation failed:', validation.report.errors);
}

// 3. Start restore
const restoreRes = await fetch('/backups/restore/start', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token },
  body: JSON.stringify({ filename: backup.filename })
});
const job = await restoreRes.json();

// 4. Monitor restore
const statusRes = await fetch(`/backups/restore/status/${job.jobId}`, {
  headers: { 'Authorization': 'Bearer ' + token }
});
const status = await statusRes.json();
console.log('Status:', status.job.status); // running, completed, failed
```

## File Structure

```
src/services/
  ├── ctBackupService.js          ← New: CTBackup format handling
  └── backupService.js            ← Updated: Integrates CTBackup
src/routes/
  └── backups.js                  ← Updated: New endpoints
public/
  └── backup-management.js        ← Updated: UI functions
src/views/
  └── backup-management.ejs       ← Updated: UI buttons
backups/
  ├── backup_2026-02-20_10-00.sql      ← Old SQL format
  └── backup_2026-02-20_12-00.CTBackup ← New CTBackup format
```

## Security Considerations

- **BACKUP_SECRET**: Keep secure and confidential
- **Signature Verification**: Prevents backup tampering
- **Checksums**: Detect corruption or data loss
- **Audit Logging**: All restore operations logged
- **File Permissions**: Backups stored with restricted access

## Performance Impact

- **Backup Creation**: ~5-15 seconds (includes compression)
- **Backup Restore**: ~30-60 seconds for 5000+ records
- **File Load Time**: ~100ms (due to compression)
- **Disk Usage**: 80% reduction vs SQL format

## Future Enhancements

Possible additions:
- Encryption (AES-256-GCM)
- AWS S3 cloud backup support
- Incremental backups
- Backup scheduling
- Differential backups
- Remote backup verification

---

**Version**: 2.0
**Format**: CTBackup
**Updated**: February 20, 2026
