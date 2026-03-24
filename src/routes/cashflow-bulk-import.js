const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const logAudit = require('../services/auditService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const candidate = raw.slice(0, 10);
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return candidate;
}

function toTemplateKeyBase(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeTemplateHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getWorksheetHeaderMap(worksheet) {
  const headerMap = new Map();
  const headerRow = worksheet.getRow(1);

  headerRow.eachCell((cell, columnNumber) => {
    const normalized = normalizeTemplateHeader(cell.value);
    if (normalized) {
      headerMap.set(normalized, columnNumber);
    }
  });

  return headerMap;
}

function findWorksheetColumn(headerMap, aliases, fallbackColumn) {
  for (const alias of aliases) {
    const columnNumber = headerMap.get(alias);
    if (columnNumber) {
      return columnNumber;
    }
  }

  return fallbackColumn;
}

function readWorksheetValue(row, columnNumber) {
  if (!columnNumber) return null;
  const cell = row.getCell(columnNumber);
  return cell ? cell.value : null;
}

function getTemplateWeekCount(rows) {
  return rows.reduce((maxWeekCount, row) => {
    const weekStart = Number(row.week_start || 0);
    const durationWeeks = Number(row.duration_weeks || row.weeks || 0);
    return Math.max(maxWeekCount, weekStart + durationWeeks);
  }, 0);
}

function buildWeeklySpreadFromRows(rows) {
  const totalWeeks = getTemplateWeekCount(rows);
  const spread = Array.from({ length: totalWeeks }, () => 0);

  rows.forEach((row) => {
    const durationWeeks = Number(row.duration_weeks || row.weeks || 0);
    const weekStart = Number(row.week_start || 0);
    if (!durationWeeks || durationWeeks <= 0) return;

    const evenWeekValue = Number((Number(row.percent || 0) / durationWeeks).toFixed(4));
    for (let index = 0; index < durationWeeks; index += 1) {
      const targetWeek = weekStart + index;
      if (targetWeek >= 0 && targetWeek < spread.length) {
        spread[targetWeek] = Number((spread[targetWeek] + evenWeekValue).toFixed(4));
      }
    }
  });

  const rounded = spread.map((value) => Number(value.toFixed(2)));
  const roundedTotal = rounded.reduce((sum, value) => sum + value, 0);
  const diff = Number((100 - roundedTotal).toFixed(2));

  if (rounded.length > 0) {
    let adjustIndex = rounded.length - 1;
    while (adjustIndex > 0 && rounded[adjustIndex] === 0) {
      adjustIndex -= 1;
    }
    rounded[adjustIndex] = Number((rounded[adjustIndex] + diff).toFixed(2));
  }

  return rounded;
}

/* ======================================================
   DOWNLOAD LOCATION BULK IMPORT TEMPLATE
   ====================================================== */
router.get(
  '/bulk-import/locations/template',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Locations', {
        pageSetup: { paperSize: 1, orientation: 'landscape' }
      });

      // Add headers
      const headers = ['Site Name', 'Location Name', 'Location Type'];
      worksheet.columns = headers.map(h => ({ header: h, key: h.toLowerCase().replace(/ /g, '_'), width: 25 }));

      // Style headers
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add sample rows
      worksheet.addRow({
        site_name: 'Sample Site 1',
        location_name: 'Plot A',
        location_type: 'Residential'
      });
      worksheet.addRow({
        site_name: 'Sample Site 2',
        location_name: 'Plot B',
        location_type: 'Commercial'
      });

      // Add instructions in a separate area
      const instructionRow = 5;
      worksheet.mergeCells(`A${instructionRow}:C${instructionRow}`);
      worksheet.getCell(`A${instructionRow}`).value = 'Instructions: Fill in Site Name and Location Name (required). Location Type is optional.';
      worksheet.getCell(`A${instructionRow}`).font = { italic: true, color: { argb: 'FF7F7F7F' } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="locations_template.xlsx"');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error generating location template:', error);
      res.status(500).json({ error: 'Failed to generate location template' });
    }
  }
);

/* ======================================================
   BULK IMPORT LOCATIONS
   ====================================================== */
router.post(
  '/bulk-import/locations',
  authenticate,
  authorizeRoles('super_admin'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.getWorksheet('Locations') || workbook.worksheets[0];

      if (!worksheet) {
        return res.status(400).json({ error: 'No valid worksheet found in Excel file' });
      }

      const rows = [];
      const errors = [];
      let rowIndex = 0;

      worksheet.eachRow((row, index) => {
        if (index === 1) return; // Skip header

        rowIndex = index;
        const siteName = String(row.getCell(1).value || '').trim();
        const locationName = String(row.getCell(2).value || '').trim();
        const locationType = String(row.getCell(3).value || '').trim() || null;

        // Validation
        if (!siteName) {
          errors.push(`Row ${index}: Site Name is required`);
          return;
        }
        if (!locationName) {
          errors.push(`Row ${index}: Location Name is required`);
          return;
        }

        rows.push({
          site_name: siteName,
          location_name: locationName,
          location_type: locationType
        });
      });

      if (errors.length > 0) {
        return res.status(400).json({ error: 'Validation errors found', details: errors });
      }

      if (rows.length === 0) {
        return res.status(400).json({ error: 'No valid data rows found in Excel file' });
      }

      // Verify all sites exist
      const siteNames = [...new Set(rows.map(r => r.site_name))];
      const [sites] = await db.query(
        'SELECT id, name FROM sites WHERE name IN (?) ORDER BY name',
        [siteNames]
      );
      const siteMap = new Map(sites.map(s => [s.name, s.id]));

      const missingSites = siteNames.filter(s => !siteMap.has(s));
      if (missingSites.length > 0) {
        return res.status(400).json({
          error: 'The following sites do not exist in the system',
          missing_sites: missingSites
        });
      }

      // Insert locations
      let inserted = 0;
      let updated = 0;

      for (const rowData of rows) {
        const siteId = siteMap.get(rowData.site_name);

        // Check if location exists
        const [[existing]] = await db.query(
          'SELECT id FROM locations WHERE site_id = ? AND name = ?',
          [siteId, rowData.location_name]
        );

        if (existing) {
          // Update location
          if (rowData.location_type) {
            await db.query(
              'UPDATE locations SET type = ? WHERE id = ?',
              [rowData.location_type, existing.id]
            );
            updated++;
          }
        } else {
          // Insert new location
          await db.query(
            'INSERT INTO locations (site_id, name, type) VALUES (?, ?, ?)',
            [siteId, rowData.location_name, rowData.location_type]
          );
          inserted++;
        }
      }

      await logAudit({
        table_name: 'locations',
        record_id: 'bulk_import',
        action: 'CREATE',
        new_data: {
          rows_processed: rows.length,
          inserted,
          updated
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        total: rows.length,
        inserted,
        updated,
        message: `Successfully imported ${inserted} new locations and updated ${updated} existing locations`
      });
    } catch (error) {
      console.error('Error bulk importing locations:', error);
      res.status(500).json({ error: 'Failed to bulk import locations', details: error.message });
    }
  }
);

/* ======================================================
   DOWNLOAD TEMPLATE BULK IMPORT TEMPLATE
   ====================================================== */
router.get(
  '/bulk-import/templates/template',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Templates', {
        pageSetup: { paperSize: 1, orientation: 'landscape' }
      });

      // Add headers
      const headers = ['Template Name', 'Stage', 'Percent', 'Start Week', 'Duration Weeks'];
      worksheet.columns = headers.map(h => ({ header: h, key: h.toLowerCase().replace(/ /g, '_'), width: 20 }));

      // Style headers
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF70AD47' }
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add sample rows
      worksheet.addRow({
        template_name: 'Standard Build 26 Week',
        stage: 'Sub-Structure',
        percent: 15,
        start_week: 0,
        duration_weeks: 4
      });
      worksheet.addRow({
        template_name: 'Standard Build 26 Week',
        stage: 'Superstructure',
        percent: 45,
        start_week: 4,
        duration_weeks: 10
      });
      worksheet.addRow({
        template_name: 'Standard Build 26 Week',
        stage: 'Finishes',
        percent: 40,
        start_week: 14,
        duration_weeks: 12
      });

      // Add instructions
      const instructionRow = 6;
      worksheet.mergeCells(`A${instructionRow}:E${instructionRow}`);
      worksheet.getCell(`A${instructionRow}`).value = 'Instructions: Group rows by Template Name. Percent must total 100 per template. Start Week must be 0 or greater. Duration Weeks must be positive integers. Legacy sheets using a Weeks column are still accepted.';
      worksheet.getCell(`A${instructionRow}`).font = { italic: true, color: { argb: 'FF7F7F7F' } };

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="templates_template.xlsx"');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error generating template template:', error);
      res.status(500).json({ error: 'Failed to generate template' });
    }
  }
);

/* ======================================================
   BULK IMPORT TEMPLATES
   ====================================================== */
router.post(
  '/bulk-import/templates',
  authenticate,
  authorizeRoles('super_admin'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.getWorksheet('Templates') || workbook.worksheets[0];

      if (!worksheet) {
        return res.status(400).json({ error: 'No valid worksheet found in Excel file' });
      }

      const headerMap = getWorksheetHeaderMap(worksheet);
      const templateNameColumn = findWorksheetColumn(headerMap, ['template_name', 'template'], 1);
      const stageColumn = findWorksheetColumn(headerMap, ['stage', 'stage_name'], 2);
      const percentColumn = findWorksheetColumn(headerMap, ['percent', 'percentage'], 3);
      const startWeekColumn = findWorksheetColumn(headerMap, ['start_week', 'week_start'], null);
      const durationColumn = findWorksheetColumn(headerMap, ['duration_weeks', 'duration', 'weeks'], 4);

      const templateMap = new Map();
      const errors = [];
      const templateRowCounts = new Map();

      worksheet.eachRow((row, index) => {
        if (index === 1) return; // Skip header

        const templateName = String(readWorksheetValue(row, templateNameColumn) || '').trim();
        const stage = String(readWorksheetValue(row, stageColumn) || '').trim();
        const percent = toNullableNumber(readWorksheetValue(row, percentColumn));
        const rawStartWeek = toNullableNumber(readWorksheetValue(row, startWeekColumn));
        const rawDurationWeeks = toNullableNumber(readWorksheetValue(row, durationColumn));

        const isBlankRow = !templateName && !stage && percent === null && rawStartWeek === null && rawDurationWeeks === null;
        if (isBlankRow) {
          return;
        }

        if (!templateName) {
          errors.push(`Row ${index}: Template Name is required`);
          return;
        }
        if (!stage) {
          errors.push(`Row ${index}: Stage is required`);
          return;
        }
        if (percent === null) {
          errors.push(`Row ${index}: Percent must be a valid number`);
          return;
        }
        if (percent < 0 || percent > 100) {
          errors.push(`Row ${index}: Percent must be between 0 and 100`);
          return;
        }

        const durationWeeks = rawDurationWeeks;
        if (durationWeeks === null || !Number.isInteger(durationWeeks) || durationWeeks <= 0) {
          errors.push(`Row ${index}: Duration Weeks must be a positive whole number`);
          return;
        }

        if (rawStartWeek !== null && (!Number.isInteger(rawStartWeek) || rawStartWeek < 0)) {
          errors.push(`Row ${index}: Start Week must be a whole number from 0`);
          return;
        }

        if (!templateMap.has(templateName)) {
          templateMap.set(templateName, []);
          templateRowCounts.set(templateName, 0);
        }

        const currentSortOrder = templateRowCounts.get(templateName) || 0;
        const rows = templateMap.get(templateName);
        const previousRow = rows[rows.length - 1] || null;
        const weekStart = rawStartWeek === null
          ? (previousRow ? previousRow.week_start + previousRow.duration_weeks : 0)
          : Number(rawStartWeek);

        templateMap.get(templateName).push({
          stage,
          percent: Number(percent),
          weeks: Number(durationWeeks),
          week_start: weekStart,
          duration_weeks: Number(durationWeeks),
          sort_order: currentSortOrder
        });
        templateRowCounts.set(templateName, currentSortOrder + 1);
      });

      if (errors.length > 0) {
        return res.status(400).json({ error: 'Validation errors found', details: errors });
      }

      if (templateMap.size === 0) {
        return res.status(400).json({ error: 'No valid template data found in Excel file' });
      }

      // Validate each template
      for (const [templateName, rows] of templateMap.entries()) {
        const totalPercent = Number(rows.reduce((sum, r) => sum + r.percent, 0).toFixed(2));
        if (Math.abs(totalPercent - 100) > 0.05) {
          errors.push(`Template "${templateName}": Percent total must equal 100 (got ${totalPercent})`);
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ error: 'Template validation errors', details: errors });
      }

      // Insert templates
      let inserted = 0;
      let skipped = 0;

      for (const [templateName, rows] of templateMap.entries()) {
        const keyBase = toTemplateKeyBase(templateName);
        let templateKey = keyBase;

        // Check for duplicate key
        let suffix = 1;
        while (true) {
          const [[existing]] = await db.query(
            'SELECT template_key FROM cashflow_templates WHERE template_key = ?',
            [templateKey]
          );
          if (!existing) break;
          suffix += 1;
          templateKey = `${keyBase}_${suffix}`;
        }

        const totalWeeks = getTemplateWeekCount(rows);
        const spreadJson = JSON.stringify(buildWeeklySpreadFromRows(rows));
        const rowsJson = JSON.stringify(rows);

        const [[duplicate]] = await db.query(
          'SELECT template_key FROM cashflow_templates WHERE name = ? AND active = 1',
          [templateName]
        );

        if (duplicate) {
          skipped++;
          continue;
        }

        await db.query(
          `INSERT INTO cashflow_templates (template_key, name, week_count, default_spread_json, template_rows_json, active)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [templateKey, templateName, totalWeeks, spreadJson, rowsJson]
        );
        inserted++;
      }

      await logAudit({
        table_name: 'cashflow_templates',
        record_id: 'bulk_import',
        action: 'CREATE',
        new_data: {
          templates_processed: templateMap.size,
          inserted,
          skipped
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        total: templateMap.size,
        inserted,
        skipped,
        message: `Successfully imported ${inserted} new templates${skipped > 0 ? ` (${skipped} skipped - already exist)` : ''}`
      });
    } catch (error) {
      console.error('Error bulk importing templates:', error);
      res.status(500).json({ error: 'Failed to bulk import templates', details: error.message });
    }
  }
);

module.exports = router;
