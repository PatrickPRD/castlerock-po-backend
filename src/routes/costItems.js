const express = require('express');
const ExcelJS = require('exceljs');
const multer = require('multer');

const db = require('../db');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const logAudit = require('../services/auditService');
const SettingsService = require('../services/settingsService');
const {
  createCostItem,
  getCostItemById,
  getCostItemHistory,
  getCurrentCostsReport,
  getDistinctMetaValues,
  getThresholds,
  listCostItems,
  mergeTypes,
  permanentlyDeleteCostItem,
  restoreCostItem,
  searchCostItems,
  softDeleteCostItem,
  updateCostItem,
  validateCostItemPayload
} = require('../services/costItemService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

function parseThresholdValue(value, fieldName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new Error(`${fieldName} must be a number between 0 and 100`);
  }

  return Number(numeric.toFixed(2));
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  return ['1', 'true', 'yes', 'y'].includes(String(value || '').trim().toLowerCase());
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getWorksheetHeaderMap(worksheet, requiredHeaders = []) {
  const maxRowsToScan = Math.min(10, worksheet.rowCount || 10);

  for (let rowNumber = 1; rowNumber <= maxRowsToScan; rowNumber += 1) {
    const headerRow = worksheet.getRow(rowNumber);
    const headerMap = {};

    headerRow.eachCell((cell, columnNumber) => {
      headerMap[normalizeHeader(cell.value)] = columnNumber;
    });

    const hasAllRequired = requiredHeaders.every((header) => headerMap[header]);
    if (hasAllRequired) {
      return {
        headerMap,
        headerRowNumber: rowNumber
      };
    }
  }

  const fallbackHeaderMap = {};
  const firstRow = worksheet.getRow(1);
  firstRow.eachCell((cell, columnNumber) => {
    fallbackHeaderMap[normalizeHeader(cell.value)] = columnNumber;
  });

  return {
    headerMap: fallbackHeaderMap,
    headerRowNumber: 1
  };
}

function getCellValue(row, columnNumber) {
  if (!columnNumber) {
    return null;
  }

  const cell = row.getCell(columnNumber);
  const value = cell?.value;
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'object') {
    // Excel formula cells are objects; use the computed result when present.
    if (value.result !== undefined && value.result !== null) {
      return value.result;
    }

    if (value.text !== undefined) {
      return value.text;
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part?.text || '').join('');
    }
  }

  return value;
}

function isWorksheetRowEmpty(row) {
  const values = Array.isArray(row.values) ? row.values.slice(1) : [];
  return values.every((value) => String(value || '').trim() === '');
}

router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const includeDeleted = req.user.role === 'super_admin' && normalizeBoolean(req.query.includeDeleted);
      const deletedOnly = req.user.role === 'super_admin' && normalizeBoolean(req.query.deletedOnly);
      const items = await listCostItems({ includeDeleted, deletedOnly });
      res.json(items);
    } catch (error) {
      console.error('Error fetching cost items:', error);
      res.status(500).json({ error: 'Failed to fetch cost items' });
    }
  }
);

router.get(
  '/deleted',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const items = await listCostItems({ deletedOnly: true });
      res.json(items);
    } catch (error) {
      console.error('Error fetching deleted cost items:', error);
      res.status(500).json({ error: 'Failed to fetch deleted cost items' });
    }
  }
);

router.get(
  '/search',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    try {
      const results = await searchCostItems(req.query.q || '');
      res.json(results);
    } catch (error) {
      console.error('Error searching cost items:', error);
      res.status(500).json({ error: 'Failed to search cost items' });
    }
  }
);

router.get(
  '/meta/types',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    try {
      const values = await getDistinctMetaValues('type');
      res.json(values);
    } catch (error) {
      console.error('Error fetching cost item types:', error);
      res.status(500).json({ error: 'Failed to fetch cost item types' });
    }
  }
);

router.get(
  '/meta/units',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    try {
      const values = await getDistinctMetaValues('unit');
      res.json(values);
    } catch (error) {
      console.error('Error fetching cost item units:', error);
      res.status(500).json({ error: 'Failed to fetch cost item units' });
    }
  }
);

router.get(
  '/reports/current-costs',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const report = await getCurrentCostsReport({
        type: req.query.type,
        status: req.query.status,
        search: req.query.search,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo
      });
      res.json(report);
    } catch (error) {
      console.error('Error fetching current costs report:', error);
      res.status(500).json({ error: 'Failed to fetch current costs report' });
    }
  }
);

router.get(
  '/:id/history',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Invalid cost item id' });
      }

      const history = await getCostItemHistory(itemId, {
        limit: req.query.limit
      });

      res.json(history);
    } catch (error) {
      console.error('Error fetching cost item history:', error);
      res.status(400).json({ error: error.message || 'Failed to fetch cost item history' });
    }
  }
);

router.get(
  '/:id/history/admin',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Invalid cost item id' });
      }

      const [rows] = await db.query(
        `SELECT h.id, h.old_cost_per, h.new_cost_per, h.change_source, h.changed_at,
                u.email AS changed_by_email
         FROM cost_item_cost_history h
         LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.cost_item_id = ?
         ORDER BY h.changed_at DESC, h.id DESC
         LIMIT 200`,
        [itemId]
      );

      res.json(rows.map((row) => ({
        id: row.id,
        old_cost_per: Number(row.old_cost_per),
        new_cost_per: Number(row.new_cost_per),
        change_source: row.change_source,
        changed_at: row.changed_at,
        changed_by_email: row.changed_by_email || null
      })));
    } catch (error) {
      console.error('Error fetching history admin list:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch history' });
    }
  }
);

router.get(
  '/settings/thresholds',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const thresholds = await getThresholds();
      res.json({
        yellow_threshold: thresholds.yellow,
        red_threshold: thresholds.red
      });
    } catch (error) {
      console.error('Error fetching cost thresholds:', error);
      res.status(500).json({ error: 'Failed to fetch cost thresholds' });
    }
  }
);

router.put(
  '/settings/thresholds',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const yellowThreshold = parseThresholdValue(req.body?.yellowThreshold, 'yellowThreshold');
      const redThreshold = parseThresholdValue(req.body?.redThreshold, 'redThreshold');

      const [oldYellow, oldRed] = await Promise.all([
        SettingsService.getSetting('cost_warning_yellow_threshold'),
        SettingsService.getSetting('cost_warning_red_threshold')
      ]);

      await SettingsService.updateSetting('cost_warning_yellow_threshold', yellowThreshold);
      await SettingsService.updateSetting('cost_warning_red_threshold', redThreshold);

      await logAudit({
        table_name: 'site_settings',
        record_id: 0,
        action: 'UPDATE_COST_THRESHOLDS',
        old_data: {
          yellow_threshold: oldYellow,
          red_threshold: oldRed
        },
        new_data: {
          yellow_threshold: yellowThreshold,
          red_threshold: redThreshold
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        yellow_threshold: yellowThreshold,
        red_threshold: redThreshold
      });
    } catch (error) {
      console.error('Error updating cost thresholds:', error);
      res.status(400).json({ error: error.message || 'Failed to update cost thresholds' });
    }
  }
);

router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const item = await createCostItem(req.body || {});

      await logAudit({
        table_name: 'cost_items',
        record_id: item.id,
        action: 'CREATE',
        old_data: null,
        new_data: item,
        changed_by: req.user.id,
        req
      });

      res.status(201).json(item);
    } catch (error) {
      console.error('Error creating cost item:', error);
      res.status(400).json({ error: error.message || 'Failed to create cost item' });
    }
  }
);

router.put(
  '/history/:historyId',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const historyId = Number(req.params.historyId);
      if (!Number.isInteger(historyId) || historyId <= 0) {
        return res.status(400).json({ error: 'Invalid history id' });
      }

      const [[existing]] = await db.query(
        'SELECT * FROM cost_item_cost_history WHERE id = ?',
        [historyId]
      );
      if (!existing) {
        return res.status(404).json({ error: 'History entry not found' });
      }

      const fields = [];
      const params = [];
      const updates = {};

      const { new_cost_per: newCostRaw, old_cost_per: oldCostRaw, changed_at: changedAtRaw } = req.body || {};

      if (newCostRaw !== undefined) {
        const v = Number(newCostRaw);
        if (!Number.isFinite(v) || v < 0) {
          return res.status(400).json({ error: 'new_cost_per must be a valid non-negative number' });
        }
        fields.push('new_cost_per = ?');
        params.push(Number(v.toFixed(2)));
        updates.new_cost_per = Number(v.toFixed(2));
      }

      if (oldCostRaw !== undefined) {
        const v = Number(oldCostRaw);
        if (!Number.isFinite(v) || v < 0) {
          return res.status(400).json({ error: 'old_cost_per must be a valid non-negative number' });
        }
        fields.push('old_cost_per = ?');
        params.push(Number(v.toFixed(2)));
        updates.old_cost_per = Number(v.toFixed(2));
      }

      if (changedAtRaw !== undefined) {
        const d = new Date(changedAtRaw);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: 'changed_at must be a valid date' });
        }
        fields.push('changed_at = ?');
        params.push(d);
        updates.changed_at = d;
      }

      if (!fields.length) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(historyId);
      await db.query(
        `UPDATE cost_item_cost_history SET ${fields.join(', ')} WHERE id = ?`,
        params
      );

      await logAudit({
        table_name: 'cost_item_cost_history',
        record_id: historyId,
        action: 'UPDATE_HISTORY_ENTRY',
        old_data: {
          id: existing.id,
          cost_item_id: existing.cost_item_id,
          old_cost_per: Number(existing.old_cost_per),
          new_cost_per: Number(existing.new_cost_per),
          change_source: existing.change_source,
          changed_at: existing.changed_at
        },
        new_data: updates,
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating history entry:', error);
      res.status(400).json({ error: error.message || 'Failed to update history entry' });
    }
  }
);

router.delete(
  '/history/:historyId',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const historyId = Number(req.params.historyId);
      if (!Number.isInteger(historyId) || historyId <= 0) {
        return res.status(400).json({ error: 'Invalid history id' });
      }

      const [[existing]] = await db.query(
        'SELECT * FROM cost_item_cost_history WHERE id = ?',
        [historyId]
      );
      if (!existing) {
        return res.status(404).json({ error: 'History entry not found' });
      }

      await db.query('DELETE FROM cost_item_cost_history WHERE id = ?', [historyId]);

      await logAudit({
        table_name: 'cost_item_cost_history',
        record_id: historyId,
        action: 'DELETE_HISTORY_ENTRY',
        old_data: {
          id: existing.id,
          cost_item_id: existing.cost_item_id,
          old_cost_per: Number(existing.old_cost_per),
          new_cost_per: Number(existing.new_cost_per),
          change_source: existing.change_source,
          changed_at: existing.changed_at
        },
        new_data: null,
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting history entry:', error);
      res.status(400).json({ error: error.message || 'Failed to delete history entry' });
    }
  }
);

router.put(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Invalid cost item id' });
      }

      const existing = await getCostItemById(itemId);
      if (!existing) {
        return res.status(404).json({ error: 'Cost item not found' });
      }

      const requestedCost = req.body?.costPer ?? req.body?.cost_per;
      const numericCost = Number(requestedCost);
      if (!Number.isFinite(numericCost) || numericCost < 0) {
        return res.status(400).json({ error: 'cost_per must be a valid non-negative number' });
      }

      // Super admin can edit all fields; admin can only update cost
      const isSuperAdmin = req.user.role === 'super_admin';
      const type = isSuperAdmin && req.body.type ? req.body.type.trim() : existing.type;
      const description = isSuperAdmin && req.body.description ? req.body.description.trim() : existing.description;
      const unit = isSuperAdmin && req.body.unit ? req.body.unit.trim() : existing.unit;

      const result = await updateCostItem(itemId, {
        type,
        description,
        unit,
        costPer: Number(numericCost.toFixed(2))
      }, {
        changedBy: req.user.id,
        changeSource: 'manual'
      });

      await logAudit({
        table_name: 'cost_items',
        record_id: itemId,
        action: 'UPDATE',
        old_data: result.previous,
        new_data: result.current,
        changed_by: req.user.id,
        req
      });

      res.json(result.current);
    } catch (error) {
      console.error('Error updating cost item:', error);
      res.status(400).json({ error: error.message || 'Failed to update cost item' });
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Invalid cost item id' });
      }

      const result = await softDeleteCostItem(itemId);

      await logAudit({
        table_name: 'cost_items',
        record_id: itemId,
        action: 'SOFT_DELETE',
        old_data: result.previous,
        new_data: result.current,
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting cost item:', error);
      res.status(400).json({ error: error.message || 'Failed to delete cost item' });
    }
  }
);

router.post(
  '/:id/restore',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Invalid cost item id' });
      }

      const result = await restoreCostItem(itemId);

      await logAudit({
        table_name: 'cost_items',
        record_id: itemId,
        action: 'RESTORE',
        old_data: result.previous,
        new_data: result.current,
        changed_by: req.user.id,
        req
      });

      res.json(result.current);
    } catch (error) {
      console.error('Error restoring cost item:', error);
      res.status(400).json({ error: error.message || 'Failed to restore cost item' });
    }
  }
);

router.delete(
  '/:id/permanent',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const itemId = Number(req.params.id);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return res.status(400).json({ error: 'Invalid cost item id' });
      }

      const existing = await getCostItemById(itemId);
      if (!existing) {
        return res.status(404).json({ error: 'Cost item not found' });
      }

      const confirmationCode = String(req.body?.confirmationCode || '').trim().toUpperCase();
      if (confirmationCode !== String(existing.code || '').toUpperCase()) {
        return res.status(400).json({ error: `confirmationCode must match ${existing.code}` });
      }

      const deleted = await permanentlyDeleteCostItem(itemId);

      await logAudit({
        table_name: 'cost_items',
        record_id: itemId,
        action: 'PERMANENT_DELETE',
        old_data: deleted,
        new_data: null,
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error permanently deleting cost item:', error);
      res.status(400).json({ error: error.message || 'Failed to permanently delete cost item' });
    }
  }
);

router.post(
  '/types/merge',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const affectedItems = await mergeTypes({
        keepType: req.body?.keepType,
        mergeType: req.body?.mergeType
      });

      await logAudit({
        table_name: 'cost_items',
        record_id: 0,
        action: 'MERGE_TYPES',
        old_data: {
          merge_type: req.body?.mergeType,
          affected_items: affectedItems
        },
        new_data: {
          keep_type: req.body?.keepType
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        affected: affectedItems.length
      });
    } catch (error) {
      console.error('Error merging cost item types:', error);
      res.status(400).json({ error: error.message || 'Failed to merge cost item types' });
    }
  }
);

router.get(
  '/export.xlsx',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const items = await listCostItems({ includeDeleted: true });
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Cost Items');

      worksheet.columns = [
        { header: 'Code', key: 'code', width: 16 },
        { header: 'Type', key: 'type', width: 20 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Cost Per', key: 'cost_per', width: 14 },
        { header: 'Unit', key: 'unit', width: 14 }
      ];

      worksheet.insertRow(1, ['NOTE: Do not enter values in the Code column. Codes are auto-generated during upload.']);
      worksheet.mergeCells('A1:E1');
      const noteCell = worksheet.getCell('A1');
      noteCell.font = { italic: true, bold: true, color: { argb: 'FF7A2E0B' } };
      noteCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' }
      };
      noteCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      worksheet.getRow(1).height = 24;

      const headerRow = worksheet.getRow(2);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };

      items.forEach((item) => {
        worksheet.addRow({
          code: item.code,
          type: item.type,
          description: item.description,
          cost_per: item.cost_per,
          unit: item.unit
        });
      });

      for (let rowNumber = 3; rowNumber <= Math.max(200, worksheet.rowCount); rowNumber += 1) {
        worksheet.getCell(`A${rowNumber}`).protection = { locked: true };
        worksheet.getCell(`B${rowNumber}`).protection = { locked: false };
        worksheet.getCell(`C${rowNumber}`).protection = { locked: false };
        worksheet.getCell(`D${rowNumber}`).protection = { locked: false };
        worksheet.getCell(`E${rowNumber}`).protection = { locked: false };
      }

      await worksheet.protect('cost-items-template', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: true,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="cost-items.xlsx"');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error exporting cost items:', error);
      res.status(500).json({ error: 'Failed to export cost items' });
    }
  }
);

router.post(
  '/import',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Excel file is required' });
    }

    try {
      const dryRun = normalizeBoolean(req.query?.dryRun);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];

      if (!worksheet) {
        return res.status(400).json({ error: 'No valid worksheet found in Excel file' });
      }

      const requiredHeaders = ['type', 'description', 'cost_per', 'unit'];
      const { headerMap, headerRowNumber } = getWorksheetHeaderMap(worksheet, requiredHeaders);
      const missingHeaders = requiredHeaders.filter((header) => !headerMap[header]);

      if (missingHeaders.length > 0) {
        const message = `Missing required columns: ${missingHeaders.join(', ')}`;
        if (dryRun) {
          return res.json({
            success: true,
            dry_run: true,
            valid: false,
            summary: {
              rows_scanned: 0,
              valid_rows: 0,
              to_insert: 0,
              to_update: 0,
              unchanged: 0,
              duplicates_in_file: 0,
              rows_with_errors: 1,
              rows_ignored_empty: 0,
              codes_provided: 0,
              header_row: headerRowNumber
            },
            errors: [message],
            warnings: [],
            details: []
          });
        }

        return res.status(400).json({ error: message });
      }

      const rowsToProcess = [];
      const seenCodes = new Set();
      const duplicateCodes = new Set();
      const validationErrors = [];
      const validationDetails = [];
      let rowsScanned = 0;
      let rowsIgnoredEmpty = 0;
      let codesProvided = 0;

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) {
          return;
        }

        if (isWorksheetRowEmpty(row)) {
          rowsIgnoredEmpty += 1;
          return;
        }

        rowsScanned += 1;

        const code = String(getCellValue(row, headerMap.code) || '').trim().toUpperCase();
        const validation = validateCostItemPayload({
          type: getCellValue(row, headerMap.type),
          description: getCellValue(row, headerMap.description),
          cost_per: getCellValue(row, headerMap.cost_per),
          unit: getCellValue(row, headerMap.unit)
        });

        if (code) {
          codesProvided += 1;
          if (seenCodes.has(code)) {
            duplicateCodes.add(code);
          }
          seenCodes.add(code);
        }

        if (validation.error) {
          const errorText = `Row ${rowNumber}: ${validation.error}`;
          validationErrors.push(errorText);
          validationDetails.push({
            row: rowNumber,
            action: 'error',
            message: validation.error
          });
          return;
        }

        rowsToProcess.push({
          rowNumber,
          code,
          ...validation.value
        });
      });

      if (duplicateCodes.size > 0) {
        validationErrors.push(`Duplicate codes in import file: ${[...duplicateCodes].join(', ')}`);
      }

      if (rowsToProcess.length === 0) {
        validationErrors.push('No valid data rows found in Excel file');
      }

      if (validationErrors.length > 0) {
        if (dryRun) {
          return res.json({
            success: true,
            dry_run: true,
            valid: false,
            summary: {
              rows_scanned: rowsScanned,
              valid_rows: rowsToProcess.length,
              to_insert: 0,
              to_update: 0,
              unchanged: 0,
              duplicates_in_file: duplicateCodes.size,
              rows_with_errors: validationErrors.length,
              rows_ignored_empty: rowsIgnoredEmpty,
              codes_provided: codesProvided,
              header_row: headerRowNumber
            },
            errors: validationErrors,
            warnings: [],
            details: validationDetails.slice(0, 100)
          });
        }

        return res.status(400).json({
          error: 'Import validation failed',
          details: validationErrors
        });
      }

      const codes = rowsToProcess.map((row) => row.code).filter(Boolean);
      const existingByCode = new Map();

      if (codes.length > 0) {
        const [existingRows] = await db.query(
          `
          SELECT id, code, type, description, cost_per, unit, is_deleted
          FROM cost_items
          WHERE code IN (?)
          `,
          [codes]
        );

        existingRows.forEach((row) => {
          existingByCode.set(String(row.code).toUpperCase(), row);
        });
      }

      let toInsert = 0;
      let toUpdate = 0;
      let unchanged = 0;
      const actionDetails = [];

      for (const row of rowsToProcess) {
        const existing = row.code ? existingByCode.get(row.code) : null;

        if (!existing) {
          toInsert += 1;
          actionDetails.push({
            row: row.rowNumber,
            action: 'insert',
            code: row.code || null,
            description: row.description
          });
          continue;
        }

        const changed =
          String(existing.type || '') !== row.type ||
          String(existing.description || '') !== row.description ||
          String(existing.unit || '') !== row.unit ||
          Number(existing.cost_per) !== Number(row.cost_per);

        if (!changed) {
          unchanged += 1;
          actionDetails.push({
            row: row.rowNumber,
            action: 'unchanged',
            code: row.code,
            description: row.description
          });
          continue;
        }

        toUpdate += 1;
        actionDetails.push({
          row: row.rowNumber,
          action: 'update',
          code: row.code,
          description: row.description
        });
      }

      const warnings = [];
      if (codesProvided > 0) {
        warnings.push(`${codesProvided} row(s) include Code values. Code is mainly for matching existing items; new rows without matching codes are auto-generated.`);
      }
      if (rowsIgnoredEmpty > 0) {
        warnings.push(`${rowsIgnoredEmpty} empty row(s) were ignored.`);
      }

      if (dryRun) {
        return res.json({
          success: true,
          dry_run: true,
          valid: true,
          summary: {
            rows_scanned: rowsScanned,
            valid_rows: rowsToProcess.length,
            to_insert: toInsert,
            to_update: toUpdate,
            unchanged,
            duplicates_in_file: duplicateCodes.size,
            rows_with_errors: validationErrors.length,
            rows_ignored_empty: rowsIgnoredEmpty,
            codes_provided: codesProvided,
            header_row: headerRowNumber
          },
          errors: [],
          warnings,
          details: actionDetails.slice(0, 250)
        });
      }

      const connection = await db.getConnection();
      let inserted = 0;
      let updated = 0;
      let runtimeUnchanged = 0;

      try {
        await connection.beginTransaction();

        for (const row of rowsToProcess) {
          const existing = row.code ? existingByCode.get(row.code) : null;

          if (!existing) {
            await createCostItem(row, {
              connection,
              codeOverride: row.code || null
            });

            inserted += 1;
            continue;
          }

          const changed =
            String(existing.type || '') !== row.type ||
            String(existing.description || '') !== row.description ||
            String(existing.unit || '') !== row.unit ||
            Number(existing.cost_per) !== Number(row.cost_per);

          if (!changed) {
            runtimeUnchanged += 1;
            continue;
          }

          await updateCostItem(existing.id, row, {
            connection,
            changedBy: req.user.id,
            changeSource: 'import'
          });
          updated += 1;
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      await logAudit({
        table_name: 'cost_items',
        record_id: 0,
        action: 'IMPORT',
        old_data: null,
        new_data: {
          inserted,
          updated,
          unchanged: runtimeUnchanged,
          row_count: rowsToProcess.length
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        inserted,
        updated,
        unchanged: runtimeUnchanged
      });
    } catch (error) {
      console.error('Error importing cost items:', error);
      res.status(500).json({ error: error.message || 'Failed to import cost items' });
    }
  }
);

module.exports = router;