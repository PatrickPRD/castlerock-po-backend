const express = require('express');
const router = express.Router();
const db = require('../db');
const SettingsService = require('../services/settingsService');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const logAudit = require('../services/auditService');

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;

  const toYmd = (year, month, day) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toYmd(value.getFullYear(), value.getMonth() + 1, value.getDate());
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

function addDaysToDateString(dateValue, days) {
  const normalized = normalizeDate(dateValue);
  if (!normalized) return null;

  const [year, month, day] = normalized.split('-').map((entry) => Number(entry));
  const shifted = new Date(year, month - 1, day);
  shifted.setDate(shifted.getDate() + Number(days || 0));

  const nextYear = shifted.getFullYear();
  const nextMonth = String(shifted.getMonth() + 1).padStart(2, '0');
  const nextDay = String(shifted.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function parseVatRates(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 100);
  } catch (_) {
    return [];
  }
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function calculateCapitalCostTotal(costExVatInput, vatRateInput) {
  const costExVat = Number.isFinite(Number(costExVatInput)) ? Number(costExVatInput) : 0;
  const vatRate = Number.isFinite(Number(vatRateInput)) ? Number(vatRateInput) : 0;
  const clampedVatRate = Math.max(0, Math.min(100, vatRate));
  return roundMoney(costExVat * (1 + (clampedVatRate / 100)));
}

function calculateIncomeBreakdown(sellingPriceInput, removeVatRateInput, removeFeesInput) {
  const sellingPrice = Number.isFinite(Number(sellingPriceInput)) ? Number(sellingPriceInput) : 0;
  const removeVatRate = Number.isFinite(Number(removeVatRateInput)) ? Number(removeVatRateInput) : 0;
  const removeFeesPercentage = Number.isFinite(Number(removeFeesInput)) ? Number(removeFeesInput) : 0;

  const clampedVatRate = Math.max(0, Math.min(100, removeVatRate));
  const clampedFeesPercentage = Math.max(0, Math.min(100, removeFeesPercentage));

  const vatAmount = clampedVatRate > 0
    ? roundMoney(sellingPrice * (clampedVatRate / (100 + clampedVatRate)))
    : 0;
  const sellingPriceBeforeVat = roundMoney(sellingPrice - vatAmount);
  const feesAmount = roundMoney(sellingPriceBeforeVat * (clampedFeesPercentage / 100));
  const calculatedIncome = roundMoney(sellingPrice - vatAmount - feesAmount);

  return {
    vat_amount: vatAmount,
    fees_amount: feesAmount,
    calculated_income: calculatedIncome
  };
}

function parseWeeklySpread(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function parseTemplateRows(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function normalizeWeeklySpread(value) {
  if (!Array.isArray(value)) return null;
  const normalized = value.map((entry) => Number(entry));
  if (normalized.some((entry) => !Number.isFinite(entry) || entry < 0)) {
    return null;
  }
  return normalized;
}

function validateSpreadTotal(spread) {
  const totalSpread = Number(spread.reduce((sum, value) => sum + value, 0).toFixed(2));
  return Math.abs(totalSpread - 100) <= 0.05;
}

function normalizeTemplateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const normalized = [];
  let nextSequentialWeek = 0;

  rows.forEach((row, index) => {
    const stage = String(row?.stage ?? row?.stageName ?? row?.stage_name ?? '').trim();
    const percent = Number(row?.percent);
    const durationWeeks = Number(row?.durationWeeks ?? row?.duration_weeks ?? row?.weeks);
    const rawWeekStart = row?.weekStart ?? row?.week_start;
    const hasExplicitWeekStart = !(rawWeekStart === undefined || rawWeekStart === null || rawWeekStart === '');
    const parsedWeekStart = hasExplicitWeekStart ? Number(rawWeekStart) : nextSequentialWeek;
    const parsedSortOrder = Number(row?.sortOrder ?? row?.sort_order ?? index);

    normalized.push({
      stage,
      percent,
      weeks: durationWeeks,
      week_start: parsedWeekStart,
      duration_weeks: durationWeeks,
      sort_order: Number.isInteger(parsedSortOrder) && parsedSortOrder >= 0 ? parsedSortOrder : index
    });

    if (Number.isInteger(parsedWeekStart) && Number.isInteger(durationWeeks) && durationWeeks > 0) {
      nextSequentialWeek = Math.max(nextSequentialWeek, parsedWeekStart + durationWeeks);
    }
  });

  if (normalized.some((row) => !row.stage)) return null;
  if (normalized.some((row) => !Number.isFinite(row.percent) || row.percent < 0)) return null;
  if (normalized.some((row) => !Number.isInteger(row.weeks) || row.weeks <= 0)) return null;
  if (normalized.some((row) => !Number.isInteger(row.week_start) || row.week_start < 0)) return null;

  normalized.sort((left, right) => {
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    if (left.week_start !== right.week_start) return left.week_start - right.week_start;
    return String(left.stage).localeCompare(String(right.stage), undefined, { sensitivity: 'base', numeric: true });
  });

  normalized.forEach((row, index) => {
    row.sort_order = index;
  });

  const percentTotal = Number(normalized.reduce((sum, row) => sum + row.percent, 0).toFixed(2));
  if (Math.abs(percentTotal - 100) > 0.05) return null;

  return normalized;
}

function getTemplateWeekCount(rows) {
  return rows.reduce((maxWeeks, row) => {
    const rowEnd = Number(row?.week_start) + Number(row?.duration_weeks ?? row?.weeks ?? 0);
    return Number.isFinite(rowEnd) ? Math.max(maxWeeks, rowEnd) : maxWeeks;
  }, 0);
}

function buildWeeklySpreadFromRows(rows) {
  const weekCount = getTemplateWeekCount(rows);
  const spread = Array(Math.max(weekCount, 0)).fill(0);

  rows.forEach((row) => {
    const durationWeeks = Number(row.duration_weeks ?? row.weeks);
    const weekStart = Number(row.week_start ?? 0);
    const evenWeekValue = Number((row.percent / durationWeeks).toFixed(4));
    for (let index = 0; index < durationWeeks; index += 1) {
      const weekIndex = weekStart + index;
      spread[weekIndex] = Number((Number(spread[weekIndex] || 0) + evenWeekValue).toFixed(4));
    }
  });

  const rounded = spread.map((value) => Number(value.toFixed(2)));
  const roundedTotal = rounded.reduce((sum, value) => sum + value, 0);
  const diff = Number((100 - roundedTotal).toFixed(2));
  if (rounded.length > 0) {
    let adjustmentIndex = rounded.length - 1;
    for (let index = rounded.length - 1; index >= 0; index -= 1) {
      if (rounded[index] > 0) {
        adjustmentIndex = index;
        break;
      }
    }
    rounded[adjustmentIndex] = Number((rounded[adjustmentIndex] + diff).toFixed(2));
  }
  return rounded;
}

function toTemplateDto(row) {
  const parsedRows = parseTemplateRows(row.template_rows_json) || [];
  const templateRows = normalizeTemplateRows(parsedRows) || [];
  const derivedWeekCount = templateRows.length ? getTemplateWeekCount(templateRows) : Number(row.week_count);
  return {
    key: row.template_key,
    name: row.name,
    week_count: Number(derivedWeekCount || row.week_count || 0),
    default_spread: parseWeeklySpread(row.default_spread_json) || buildWeeklySpreadFromRows(templateRows),
    rows: templateRows
  };
}

function toTemplateKeyBase(name) {
  const normalized = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'template';
}

async function loadTemplates(connectionOrDb = db) {
  const [rows] = await connectionOrDb.query(
    `SELECT template_key, name, week_count, default_spread_json, template_rows_json
     FROM cashflow_templates
     WHERE active = 1
     ORDER BY name`
  );
  return rows.map(toTemplateDto);
}

async function ensureCashflowLocationDateColumns(connectionOrDb = db) {
  async function readColumns() {
    const [rows] = await connectionOrDb.query(
      'SHOW COLUMNS FROM cashflow_location_settings'
    );
    const existingColumns = new Set(rows.map((row) => String(row.Field || '').toLowerCase()));
    return {
      startOnSiteDate: existingColumns.has('start_on_site_date'),
      completionDate: existingColumns.has('completion_date'),
      houseHandoverDate: existingColumns.has('house_handover_date'),
      removeFeesPercentage: existingColumns.has('remove_fees_percentage'),
      removeVatRate: existingColumns.has('remove_vat_rate')
    };
  }

  function isRecoverableSchemaError(error) {
    return [
      'ER_DUP_FIELDNAME',
      'ER_TABLEACCESS_DENIED_ERROR',
      'ER_DBACCESS_DENIED_ERROR',
      'ER_SPECIFIC_ACCESS_DENIED_ERROR'
    ].includes(error?.code);
  }

  let support = await readColumns();

  const columnDefinitions = [
    {
      key: 'startOnSiteDate',
      columnName: 'start_on_site_date',
      sql: 'ALTER TABLE cashflow_location_settings ADD COLUMN start_on_site_date DATE NULL AFTER selling_price'
    },
    {
      key: 'completionDate',
      columnName: 'completion_date',
      sql: 'ALTER TABLE cashflow_location_settings ADD COLUMN completion_date DATE NULL AFTER start_on_site_date'
    },
    {
      key: 'houseHandoverDate',
      columnName: 'house_handover_date',
      sql: 'ALTER TABLE cashflow_location_settings ADD COLUMN house_handover_date DATE NULL AFTER completion_date'
    },
    {
      key: 'removeFeesPercentage',
      columnName: 'remove_fees_percentage',
      sql: 'ALTER TABLE cashflow_location_settings ADD COLUMN remove_fees_percentage DECIMAL(5,2) NULL AFTER house_handover_date'
    },
    {
      key: 'removeVatRate',
      columnName: 'remove_vat_rate',
      sql: 'ALTER TABLE cashflow_location_settings ADD COLUMN remove_vat_rate DECIMAL(5,3) NULL AFTER remove_fees_percentage'
    }
  ];

  for (const definition of columnDefinitions) {
    if (support[definition.key]) continue;

    try {
      await connectionOrDb.query(definition.sql);
      support[definition.key] = true;
    } catch (error) {
      if (error?.code === 'ER_DUP_FIELDNAME') {
        support[definition.key] = true;
      } else if (!isRecoverableSchemaError(error)) {
        throw error;
      } else {
        console.warn(`Cashflow schema check: unable to auto-add ${definition.columnName} column:`, error.code || error.message);
      }
    }
  }

  try {
    const finalSupport = await readColumns();
    return {
      startOnSiteDate: support.startOnSiteDate || finalSupport.startOnSiteDate,
      completionDate: support.completionDate || finalSupport.completionDate,
      houseHandoverDate: support.houseHandoverDate || finalSupport.houseHandoverDate,
      removeFeesPercentage: support.removeFeesPercentage || finalSupport.removeFeesPercentage,
      removeVatRate: support.removeVatRate || finalSupport.removeVatRate
    };
  } catch (_) {
    return support;
  }
}

async function ensureCashflowCapitalCostsTable(connectionOrDb = db) {
  await connectionOrDb.query(
    `CREATE TABLE IF NOT EXISTS cashflow_capital_costs (
      id INT NOT NULL AUTO_INCREMENT,
      title VARCHAR(200) NOT NULL,
      description TEXT NULL,
      cost_ex_vat DECIMAL(15,2) NOT NULL,
      vat_rate DECIMAL(5,3) NOT NULL,
      total_inc_vat DECIMAL(15,2) NOT NULL,
      date_applied DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_cashflow_capital_costs_date_applied (date_applied)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function toCapitalCostDto(row) {
  return {
    id: Number(row.id),
    title: String(row.title || ''),
    description: row.description === null || row.description === undefined ? '' : String(row.description),
    cost_ex_vat: row.cost_ex_vat === null || row.cost_ex_vat === undefined ? 0 : Number(row.cost_ex_vat),
    vat_rate: row.vat_rate === null || row.vat_rate === undefined ? 0 : Number(row.vat_rate),
    total_inc_vat: row.total_inc_vat === null || row.total_inc_vat === undefined ? 0 : Number(row.total_inc_vat),
    date_applied: normalizeDate(row.date_applied)
  };
}

async function loadCapitalCosts(connectionOrDb = db) {
  await ensureCashflowCapitalCostsTable(connectionOrDb);
  const [rows] = await connectionOrDb.query(
    `SELECT id, title, description, cost_ex_vat, vat_rate, total_inc_vat, date_applied
     FROM cashflow_capital_costs
     ORDER BY date_applied ASC, id ASC`
  );
  return rows.map(toCapitalCostDto);
}

async function resolveProjectStartDate(connectionOrDb = db) {
  const [[overall]] = await connectionOrDb.query(
    `SELECT overall_start_date
     FROM cashflow_settings
     WHERE id = 1`
  );

  const normalizedOverallStartDate = normalizeDate(overall?.overall_start_date);
  if (normalizedOverallStartDate) {
    return normalizedOverallStartDate;
  }

  const [[earliest]] = await connectionOrDb.query(
    `SELECT MIN(start_on_site_date) AS earliest_start_date
     FROM cashflow_location_settings
     WHERE include_in_cashflow = 1
       AND start_on_site_date IS NOT NULL`
  );

  return normalizeDate(earliest?.earliest_start_date);
}

async function getAvailableVatRates() {
  const settings = await SettingsService.getSettings();
  const configuredVatRates = parseVatRates(settings?.vat_rates);
  return configuredVatRates.length ? configuredVatRates : [0, 13.5, 23];
}

function validateCapitalCostPayload(body, vatRateKeys) {
  const title = String(body?.title || '').trim();
  const descriptionRaw = body?.description;
  const description = descriptionRaw === null || descriptionRaw === undefined
    ? ''
    : String(descriptionRaw).trim();
  const costExVat = toNullableNumber(body?.cost_ex_vat);
  const vatRate = toNullableNumber(body?.vat_rate);
  const dateApplied = normalizeDate(body?.date_applied);

  if (!title) {
    return { error: 'title is required' };
  }

  if (costExVat === null) {
    return { error: 'cost_ex_vat must be a valid number' };
  }

  if (costExVat < 0) {
    return { error: 'cost_ex_vat cannot be negative' };
  }

  if (vatRate === null) {
    return { error: 'vat_rate must be a valid number' };
  }

  if (vatRate < 0 || vatRate > 100) {
    return { error: 'vat_rate must be between 0 and 100' };
  }

  const vatRateKey = Number(Number(vatRate).toFixed(3));
  if (!vatRateKeys.has(vatRateKey)) {
    return { error: 'vat_rate must match one of the configured Financial Settings VAT rates' };
  }

  if (body?.date_applied && !dateApplied) {
    return { error: 'date_applied must be in YYYY-MM-DD format' };
  }

  return {
    value: {
      title,
      description,
      cost_ex_vat: costExVat,
      vat_rate: vatRate,
      date_applied: dateApplied
    }
  };
}

router.get(
  '/capital-costs',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const [capitalCosts, projectStartDate] = await Promise.all([
        loadCapitalCosts(),
        resolveProjectStartDate()
      ]);

      res.json({
        project_start_date: projectStartDate,
        capital_costs: capitalCosts
      });
    } catch (error) {
      console.error('Error loading cashflow capital costs:', error);
      res.status(500).json({ error: 'Failed to load cashflow capital costs' });
    }
  }
);

router.post(
  '/capital-costs',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      await ensureCashflowCapitalCostsTable();
      const availableVatRates = await getAvailableVatRates();
      const vatRateKeys = new Set(availableVatRates.map((rate) => Number(Number(rate).toFixed(3))));
      const validated = validateCapitalCostPayload(req.body, vatRateKeys);
      if (validated.error) {
        return res.status(400).json({ error: validated.error });
      }

      const projectStartDate = await resolveProjectStartDate();
      const fallbackToday = normalizeDate(new Date());
      const normalizedDateApplied = validated.value.date_applied || projectStartDate || fallbackToday;
      const totalIncVat = calculateCapitalCostTotal(validated.value.cost_ex_vat, validated.value.vat_rate);

      const [result] = await db.query(
        `INSERT INTO cashflow_capital_costs (
          title,
          description,
          cost_ex_vat,
          vat_rate,
          total_inc_vat,
          date_applied
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          validated.value.title,
          validated.value.description || null,
          validated.value.cost_ex_vat,
          validated.value.vat_rate,
          totalIncVat,
          normalizedDateApplied
        ]
      );

      const capitalCostId = Number(result.insertId);

      await logAudit({
        table_name: 'cashflow_capital_costs',
        record_id: String(capitalCostId),
        action: 'CREATE',
        new_data: {
          title: validated.value.title,
          cost_ex_vat: validated.value.cost_ex_vat,
          vat_rate: validated.value.vat_rate
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        capital_cost: {
          id: capitalCostId,
          title: validated.value.title,
          description: validated.value.description,
          cost_ex_vat: validated.value.cost_ex_vat,
          vat_rate: validated.value.vat_rate,
          total_inc_vat: totalIncVat,
          date_applied: normalizedDateApplied
        }
      });
    } catch (error) {
      console.error('Error creating cashflow capital cost:', error);
      res.status(500).json({ error: 'Failed to create cashflow capital cost' });
    }
  }
);

router.put(
  '/capital-costs/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const capitalCostId = Number(req.params.id);

    if (!Number.isInteger(capitalCostId) || capitalCostId <= 0) {
      return res.status(400).json({ error: 'A valid capital cost id is required' });
    }

    try {
      await ensureCashflowCapitalCostsTable();
      const availableVatRates = await getAvailableVatRates();
      const vatRateKeys = new Set(availableVatRates.map((rate) => Number(Number(rate).toFixed(3))));
      const validated = validateCapitalCostPayload(req.body, vatRateKeys);
      if (validated.error) {
        return res.status(400).json({ error: validated.error });
      }

      const projectStartDate = await resolveProjectStartDate();
      const fallbackToday = normalizeDate(new Date());
      const normalizedDateApplied = validated.value.date_applied || projectStartDate || fallbackToday;
      const totalIncVat = calculateCapitalCostTotal(validated.value.cost_ex_vat, validated.value.vat_rate);

      const [result] = await db.query(
        `UPDATE cashflow_capital_costs
         SET
           title = ?,
           description = ?,
           cost_ex_vat = ?,
           vat_rate = ?,
           total_inc_vat = ?,
           date_applied = ?
         WHERE id = ?`,
        [
          validated.value.title,
          validated.value.description || null,
          validated.value.cost_ex_vat,
          validated.value.vat_rate,
          totalIncVat,
          normalizedDateApplied,
          capitalCostId
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Capital cost not found' });
      }

      await logAudit({
        table_name: 'cashflow_capital_costs',
        record_id: String(capitalCostId),
        action: 'UPDATE',
        new_data: {
          title: validated.value.title,
          cost_ex_vat: validated.value.cost_ex_vat,
          vat_rate: validated.value.vat_rate
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        capital_cost: {
          id: capitalCostId,
          title: validated.value.title,
          description: validated.value.description,
          cost_ex_vat: validated.value.cost_ex_vat,
          vat_rate: validated.value.vat_rate,
          total_inc_vat: totalIncVat,
          date_applied: normalizedDateApplied
        }
      });
    } catch (error) {
      console.error('Error updating cashflow capital cost:', error);
      res.status(500).json({ error: 'Failed to update cashflow capital cost' });
    }
  }
);

router.delete(
  '/capital-costs/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const capitalCostId = Number(req.params.id);

    if (!Number.isInteger(capitalCostId) || capitalCostId <= 0) {
      return res.status(400).json({ error: 'A valid capital cost id is required' });
    }

    try {
      await ensureCashflowCapitalCostsTable();
      const [result] = await db.query(
        'DELETE FROM cashflow_capital_costs WHERE id = ? LIMIT 1',
        [capitalCostId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Capital cost not found' });
      }

      await logAudit({
        table_name: 'cashflow_capital_costs',
        record_id: String(capitalCostId),
        action: 'DELETE',
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting cashflow capital cost:', error);
      res.status(500).json({ error: 'Failed to delete cashflow capital cost' });
    }
  }
);

router.get(
  '/templates',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const templates = await loadTemplates();
      res.json({ templates });
    } catch (error) {
      console.error('Error loading cashflow templates:', error);
      res.status(500).json({ error: 'Failed to load cashflow templates' });
    }
  }
);

router.post(
  '/templates',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { name, rows } = req.body || {};

    const templateName = String(name || '').trim();
    const normalizedRows = normalizeTemplateRows(rows);

    if (!templateName) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!normalizedRows) {
      return res.status(400).json({ error: 'rows must include valid stage, percent, and weeks values totaling 100%' });
    }

    const normalizedWeekCount = getTemplateWeekCount(normalizedRows);
    if (!Number.isInteger(normalizedWeekCount) || normalizedWeekCount <= 0 || normalizedWeekCount > 104) {
      return res.status(400).json({ error: 'Total weeks across rows must be between 1 and 104' });
    }

    const normalizedSpread = buildWeeklySpreadFromRows(normalizedRows);

    const keyBase = toTemplateKeyBase(templateName);
    let templateKey = keyBase;

    try {
      let suffix = 1;
      while (true) {
        const [[existing]] = await db.query(
          'SELECT template_key FROM cashflow_templates WHERE template_key = ? LIMIT 1',
          [templateKey]
        );
        if (!existing) break;
        suffix += 1;
        templateKey = `${keyBase}_${suffix}`;
      }

      await db.query(
        `INSERT INTO cashflow_templates (
          template_key,
          name,
          week_count,
          default_spread_json,
          template_rows_json,
          active
        ) VALUES (?, ?, ?, ?, ?, 1)`,
        [
          templateKey,
          templateName,
          normalizedWeekCount,
          JSON.stringify(normalizedSpread),
          JSON.stringify(normalizedRows)
        ]
      );

      await logAudit({
        table_name: 'cashflow_templates',
        record_id: templateKey,
        action: 'CREATE',
        new_data: {
          name: templateName,
          week_count: normalizedWeekCount,
          rows: normalizedRows
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        template: {
          key: templateKey,
          name: templateName,
          week_count: normalizedWeekCount,
          default_spread: normalizedSpread,
          rows: normalizedRows
        }
      });
    } catch (error) {
      console.error('Error creating cashflow template:', error);
      res.status(500).json({ error: 'Failed to create cashflow template' });
    }
  }
);

router.put(
  '/templates/:templateKey',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const templateKey = String(req.params.templateKey || '').trim();
    const { name, rows } = req.body || {};

    const templateName = String(name || '').trim();
    const normalizedRows = normalizeTemplateRows(rows);

    if (!templateKey) {
      return res.status(400).json({ error: 'Template key is required' });
    }

    if (!templateName) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    if (!normalizedRows) {
      return res.status(400).json({ error: 'rows must include valid stage, percent, and weeks values totaling 100%' });
    }

    const normalizedWeekCount = getTemplateWeekCount(normalizedRows);
    if (!Number.isInteger(normalizedWeekCount) || normalizedWeekCount <= 0 || normalizedWeekCount > 104) {
      return res.status(400).json({ error: 'Total weeks across rows must be between 1 and 104' });
    }

    const normalizedSpread = buildWeeklySpreadFromRows(normalizedRows);

    try {
      const [[existing]] = await db.query(
        'SELECT template_key FROM cashflow_templates WHERE template_key = ? AND active = 1 LIMIT 1',
        [templateKey]
      );

      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      await db.query(
        `UPDATE cashflow_templates
         SET name = ?, week_count = ?, default_spread_json = ?, template_rows_json = ?
         WHERE template_key = ?`,
        [
          templateName,
          normalizedWeekCount,
          JSON.stringify(normalizedSpread),
          JSON.stringify(normalizedRows),
          templateKey
        ]
      );

      await logAudit({
        table_name: 'cashflow_templates',
        record_id: templateKey,
        action: 'UPDATE',
        new_data: {
          name: templateName,
          week_count: normalizedWeekCount,
          rows: normalizedRows
        },
        changed_by: req.user.id,
        req
      });

      res.json({
        success: true,
        template: {
          key: templateKey,
          name: templateName,
          week_count: normalizedWeekCount,
          default_spread: normalizedSpread,
          rows: normalizedRows
        }
      });
    } catch (error) {
      console.error('Error updating cashflow template:', error);
      res.status(500).json({ error: 'Failed to update cashflow template' });
    }
  }
);

router.delete(
  '/templates/:templateKey',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const templateKey = String(req.params.templateKey || '').trim();
    if (!templateKey) {
      return res.status(400).json({ error: 'Template key is required' });
    }

    try {
      const [[existing]] = await db.query(
        'SELECT template_key FROM cashflow_templates WHERE template_key = ? AND active = 1 LIMIT 1',
        [templateKey]
      );
      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const [[inUse]] = await db.query(
        `SELECT location_id
         FROM cashflow_location_settings
         WHERE include_in_cashflow = 1 AND template_key = ?
         LIMIT 1`,
        [templateKey]
      );

      if (inUse) {
        return res.status(400).json({ error: 'Template is currently used by one or more locations' });
      }

      await db.query(
        'UPDATE cashflow_templates SET active = 0 WHERE template_key = ?',
        [templateKey]
      );

      await logAudit({
        table_name: 'cashflow_templates',
        record_id: templateKey,
        action: 'DELETE',
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting cashflow template:', error);
      res.status(500).json({ error: 'Failed to delete cashflow template' });
    }
  }
);

router.get(
  '/settings',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const dateColumnSupport = await ensureCashflowLocationDateColumns();
      await ensureCashflowCapitalCostsTable();
      const startOnSiteSelect = dateColumnSupport.startOnSiteDate
        ? 'cls.start_on_site_date'
        : 'NULL AS start_on_site_date';
      const completionDateSelect = dateColumnSupport.completionDate
        ? 'cls.completion_date'
        : 'NULL AS completion_date';
      const houseHandoverSelect = dateColumnSupport.houseHandoverDate
        ? 'cls.house_handover_date'
        : 'NULL AS house_handover_date';
      const removeFeesSelect = dateColumnSupport.removeFeesPercentage
        ? 'cls.remove_fees_percentage'
        : 'NULL AS remove_fees_percentage';
      const removeVatSelect = dateColumnSupport.removeVatRate
        ? 'cls.remove_vat_rate'
        : 'NULL AS remove_vat_rate';

      const [templates, availableVatRates, capitalCosts] = await Promise.all([
        loadTemplates(),
        getAvailableVatRates(),
        loadCapitalCosts()
      ]);
      const defaultVatRate = availableVatRates[0];

      const [[overall]] = await db.query(
        `SELECT overall_start_date, overall_start_value
         FROM cashflow_settings
         WHERE id = 1`
      );

      const [rows] = await db.query(
        `SELECT
          l.id AS location_id,
          l.name AS location_name,
          l.type AS location_type,
          s.id AS site_id,
          s.name AS site_name,
          COALESCE(cls.include_in_cashflow, 0) AS include_in_cashflow,
          cls.estimated_construction_cost,
          cls.predicted_spend_percentage,
          cls.spend_timescale_months,
          cls.selling_price,
          ${startOnSiteSelect},
          ${completionDateSelect},
          ${houseHandoverSelect},
          ${removeFeesSelect},
          ${removeVatSelect},
          cls.template_key,
          cls.weekly_spread_json
         FROM locations l
         JOIN sites s ON s.id = l.site_id
         LEFT JOIN cashflow_location_settings cls ON cls.location_id = l.id
         ORDER BY s.name, l.name`
      );

      const mappedLocations = rows.map((row) => ({
        location_id: row.location_id,
        location_name: row.location_name,
        location_type: row.location_type || null,
        site_id: row.site_id,
        site_name: row.site_name,
        include_in_cashflow: Number(row.include_in_cashflow) === 1,
        estimated_construction_cost: row.estimated_construction_cost === null ? null : Number(row.estimated_construction_cost),
        predicted_spend_percentage: row.predicted_spend_percentage === null ? null : Number(row.predicted_spend_percentage),
        spend_timescale_months: row.spend_timescale_months === null ? null : Number(row.spend_timescale_months),
        selling_price: row.selling_price === null ? null : Number(row.selling_price),
        start_on_site_date: normalizeDate(row.start_on_site_date),
        completion_date: normalizeDate(row.completion_date),
        house_handover_date: normalizeDate(row.house_handover_date),
        remove_fees_percentage: row.remove_fees_percentage === null ? null : Number(row.remove_fees_percentage),
        remove_vat_rate: row.remove_vat_rate === null ? null : Number(row.remove_vat_rate),
        template_key: row.template_key || null,
        weekly_spread: parseWeeklySpread(row.weekly_spread_json)
      }));

      const earliestIncludedStartDate = mappedLocations
        .filter((row) => row.include_in_cashflow && row.start_on_site_date)
        .map((row) => row.start_on_site_date)
        .sort((a, b) => a.localeCompare(b))[0] || null;
      const persistedOverallStartDate = normalizeDate(overall?.overall_start_date);
      const resolvedProjectStartDate = earliestIncludedStartDate || persistedOverallStartDate || null;

      const locationsWithIncome = mappedLocations.map((row) => {
        const removeVatRate = row.remove_vat_rate === null || row.remove_vat_rate === undefined
          ? defaultVatRate
          : Number(row.remove_vat_rate);
        const removeFeesPercentage = row.remove_fees_percentage === null || row.remove_fees_percentage === undefined
          ? 0
          : Number(row.remove_fees_percentage);
        const income = calculateIncomeBreakdown(row.selling_price, removeVatRate, removeFeesPercentage);

        return {
          ...row,
          house_handover_date: normalizeDate(row.house_handover_date),
          remove_fees_percentage: row.remove_fees_percentage === null || row.remove_fees_percentage === undefined
            ? 0
            : Number(row.remove_fees_percentage),
          remove_vat_rate: Number.isFinite(removeVatRate) ? removeVatRate : defaultVatRate,
          vat_amount: income.vat_amount,
          fees_amount: income.fees_amount,
          calculated_income: income.calculated_income
        };
      });

      res.json({
        overall_start_date: resolvedProjectStartDate,
        overall_start_value: overall?.overall_start_value === null || overall?.overall_start_value === undefined
          ? null
          : Number(overall.overall_start_value),
        vat_rates: availableVatRates,
        templates,
        capital_costs: capitalCosts,
        capital_costs_total_inc_vat: roundMoney(capitalCosts.reduce((sum, item) => sum + (Number(item.total_inc_vat) || 0), 0)),
        locations: locationsWithIncome
      });
    } catch (error) {
      console.error('Error fetching cashflow settings:', error);
      res.status(500).json({ error: 'Failed to fetch cashflow settings' });
    }
  }
);

router.put(
  '/settings',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { overallStartValue, locations } = req.body || {};

    const normalizedStartValue = toNullableNumber(overallStartValue);
    if (overallStartValue !== null && overallStartValue !== undefined && overallStartValue !== '' && normalizedStartValue === null) {
      return res.status(400).json({ error: 'overallStartValue must be a valid number' });
    }
    if (normalizedStartValue !== null && normalizedStartValue < 0) {
      return res.status(400).json({ error: 'overallStartValue cannot be negative' });
    }

    if (!Array.isArray(locations)) {
      return res.status(400).json({ error: 'locations must be an array' });
    }

    try {
      const dateColumnSupport = await ensureCashflowLocationDateColumns();
      if (
        !dateColumnSupport.startOnSiteDate ||
        !dateColumnSupport.completionDate ||
        !dateColumnSupport.houseHandoverDate ||
        !dateColumnSupport.removeFeesPercentage ||
        !dateColumnSupport.removeVatRate
      ) {
        return res.status(500).json({
          error: 'Database schema is missing required cashflow settings columns. Run database migrations and try again.'
        });
      }

      const templates = await loadTemplates();
      const templateMap = new Map(templates.map((template) => [template.key, template]));
      const settings = await SettingsService.getSettings();
      const configuredVatRates = parseVatRates(settings?.vat_rates);
      const availableVatRates = configuredVatRates.length ? configuredVatRates : [0, 13.5, 23];
      const defaultVatRate = availableVatRates[0];
      const availableVatRateKeys = new Set(availableVatRates.map((rate) => Number(Number(rate).toFixed(3))));
      let earliestIncludedStartDate = null;
      const normalizedLocations = [];

      for (const item of locations) {
        const locationId = Number(item?.location_id);
        if (!Number.isInteger(locationId) || locationId <= 0) {
          return res.status(400).json({ error: 'Each location must include a valid location_id' });
        }

        const estimatedConstructionCost = toNullableNumber(item?.estimated_construction_cost);
        const predictedSpendPercentage = toNullableNumber(item?.predicted_spend_percentage);
        const spendTimescaleMonths = toNullableNumber(item?.spend_timescale_months);
        const sellingPrice = toNullableNumber(item?.selling_price);
        const startOnSiteDate = normalizeDate(item?.start_on_site_date);
        const completionDate = normalizeDate(item?.completion_date);
        const providedHandoverDate = normalizeDate(item?.house_handover_date);
        const removeFeesPercentageRaw = toNullableNumber(item?.remove_fees_percentage);
        const removeVatRateRaw = toNullableNumber(item?.remove_vat_rate);
        const templateKey = item?.template_key ? String(item.template_key).trim() : null;
        const normalizedSpread = normalizeWeeklySpread(item?.weekly_spread);

        if (estimatedConstructionCost !== null && estimatedConstructionCost < 0) {
          return res.status(400).json({ error: 'estimated_construction_cost cannot be negative' });
        }

        if (predictedSpendPercentage !== null && (predictedSpendPercentage < 0 || predictedSpendPercentage > 100)) {
          return res.status(400).json({ error: 'predicted_spend_percentage must be between 0 and 100' });
        }

        if (spendTimescaleMonths !== null && (!Number.isInteger(spendTimescaleMonths) || spendTimescaleMonths <= 0)) {
          return res.status(400).json({ error: 'spend_timescale_months must be a positive whole number' });
        }

        if (sellingPrice !== null && sellingPrice < 0) {
          return res.status(400).json({ error: 'selling_price cannot be negative' });
        }

        if (item?.start_on_site_date && !startOnSiteDate) {
          return res.status(400).json({ error: 'start_on_site_date must be in YYYY-MM-DD format' });
        }

        if (item?.completion_date && !completionDate) {
          return res.status(400).json({ error: 'completion_date must be in YYYY-MM-DD format' });
        }

        if (item?.house_handover_date && !providedHandoverDate) {
          return res.status(400).json({ error: 'house_handover_date must be in YYYY-MM-DD format' });
        }

        if (startOnSiteDate && completionDate && completionDate < startOnSiteDate) {
          return res.status(400).json({ error: 'completion_date cannot be before start_on_site_date' });
        }

        if (
          removeFeesPercentageRaw !== null &&
          (removeFeesPercentageRaw < 0 || removeFeesPercentageRaw > 100)
        ) {
          return res.status(400).json({ error: 'Prof. fees % must be between 0 and 100' });
        }

        if (
          removeVatRateRaw !== null &&
          (removeVatRateRaw < 0 || removeVatRateRaw > 100)
        ) {
          return res.status(400).json({ error: 'VAT rate must be between 0 and 100' });
        }

        const includeInCashflow = !!item?.include_in_cashflow;
        let houseHandoverDate = null;
        let removeFeesPercentage = null;
        let removeVatRate = null;

        if (includeInCashflow) {
          const template = templateMap.get(templateKey);
          if (!template) {
            return res.status(400).json({ error: 'A valid template_key is required for included locations' });
          }

          if (!normalizedSpread || normalizedSpread.length !== Number(template.week_count)) {
            return res.status(400).json({ error: `weekly_spread must contain ${template.week_count} values for template ${template.key}` });
          }

          if (!validateSpreadTotal(normalizedSpread)) {
            return res.status(400).json({ error: 'weekly_spread must total 100%' });
          }

          if (!startOnSiteDate || !completionDate) {
            return res.status(400).json({ error: 'start_on_site_date and completion_date are required for included locations' });
          }

          houseHandoverDate = providedHandoverDate || addDaysToDateString(completionDate, 7);
          if (houseHandoverDate < completionDate) {
            return res.status(400).json({ error: 'house_handover_date cannot be before completion_date' });
          }

          removeFeesPercentage = removeFeesPercentageRaw === null ? 0 : removeFeesPercentageRaw;
          removeVatRate = removeVatRateRaw === null ? defaultVatRate : removeVatRateRaw;

          const removeVatKey = Number(Number(removeVatRate).toFixed(3));
          if (!availableVatRateKeys.has(removeVatKey)) {
            return res.status(400).json({ error: 'VAT rate must match one of the configured Financial Settings VAT rates' });
          }

          if (!earliestIncludedStartDate || startOnSiteDate < earliestIncludedStartDate) {
            earliestIncludedStartDate = startOnSiteDate;
          }
        }

        normalizedLocations.push({
          location_id: locationId,
          include_in_cashflow: includeInCashflow,
          estimated_construction_cost: estimatedConstructionCost,
          predicted_spend_percentage: predictedSpendPercentage,
          spend_timescale_months: spendTimescaleMonths,
          selling_price: sellingPrice,
          start_on_site_date: includeInCashflow ? startOnSiteDate : null,
          completion_date: includeInCashflow ? completionDate : null,
          house_handover_date: includeInCashflow ? houseHandoverDate : null,
          remove_fees_percentage: includeInCashflow ? removeFeesPercentage : null,
          remove_vat_rate: includeInCashflow ? removeVatRate : null,
          template_key: includeInCashflow ? templateKey : null,
          weekly_spread_json: includeInCashflow && Array.isArray(normalizedSpread)
            ? JSON.stringify(normalizedSpread.map((entry) => Number(entry)))
            : null
        });
      }

      let connection;
      try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query(
          `INSERT INTO cashflow_settings (id, overall_start_date, overall_start_value)
           VALUES (1, ?, ?)
           ON DUPLICATE KEY UPDATE
             overall_start_date = VALUES(overall_start_date),
             overall_start_value = VALUES(overall_start_value)`,
          [earliestIncludedStartDate, normalizedStartValue]
        );

        for (const item of normalizedLocations) {
          await connection.query(
            `INSERT INTO cashflow_location_settings (
              location_id,
              include_in_cashflow,
              estimated_construction_cost,
              predicted_spend_percentage,
              spend_timescale_months,
              selling_price,
              start_on_site_date,
              completion_date,
              house_handover_date,
              remove_fees_percentage,
              remove_vat_rate,
              template_key,
              weekly_spread_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              include_in_cashflow = VALUES(include_in_cashflow),
              estimated_construction_cost = VALUES(estimated_construction_cost),
              predicted_spend_percentage = VALUES(predicted_spend_percentage),
              spend_timescale_months = VALUES(spend_timescale_months),
              selling_price = VALUES(selling_price),
              start_on_site_date = VALUES(start_on_site_date),
              completion_date = VALUES(completion_date),
              house_handover_date = VALUES(house_handover_date),
              remove_fees_percentage = VALUES(remove_fees_percentage),
              remove_vat_rate = VALUES(remove_vat_rate),
              template_key = VALUES(template_key),
              weekly_spread_json = VALUES(weekly_spread_json)`,
            [
              item.location_id,
              item.include_in_cashflow ? 1 : 0,
              item.estimated_construction_cost,
              item.predicted_spend_percentage,
              item.spend_timescale_months,
              item.selling_price,
              item.start_on_site_date,
              item.completion_date,
              item.house_handover_date,
              item.remove_fees_percentage,
              item.remove_vat_rate,
              item.template_key,
              item.weekly_spread_json
            ]
          );

          await logAudit({
            table_name: 'cashflow_location_settings',
            record_id: String(item.location_id),
            action: 'UPDATE',
            new_data: {
              include_in_cashflow: item.include_in_cashflow,
              template_key: item.template_key,
              estimated_construction_cost: item.estimated_construction_cost
            },
            changed_by: req.user.id,
            req
          });
        }

        await connection.commit();
        res.json({
          success: true,
          overall_start_date: earliestIncludedStartDate,
          overall_start_value: normalizedStartValue
        });
      } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error updating cashflow settings:', error);
        res.status(500).json({ error: 'Failed to update cashflow settings' });
      } finally {
        if (connection) connection.release();
      }
    } catch (error) {
      console.error('Error validating cashflow settings:', error);
      res.status(500).json({ error: 'Failed to validate cashflow settings' });
    }
  }
);

/* ======================================================
   GET LOCATION TYPES (Searchable list for dropdown)
   ====================================================== */
router.get(
  '/location-types',
  async (req, res) => {
    try {
      const [types] = await db.query(
        `SELECT DISTINCT type FROM locations
         WHERE type IS NOT NULL AND type != ''
         ORDER BY type ASC`
      );
      res.json(types.map(t => t.type));
    } catch (error) {
      console.error('Error fetching location types:', error);
      res.status(500).json({ error: 'Failed to fetch location types' });
    }
  }
);

/* ======================================================
   GET LOCATION TYPE TEMPLATES (Current mappings grouped by template)
   ====================================================== */
router.get(
  '/location-type-templates',
  authenticate,
  async (req, res) => {
    try {
      const [templates] = await db.query(
        `SELECT template_key, name FROM cashflow_templates WHERE active = 1 ORDER BY created_at ASC`
      );

      const [mappings] = await db.query(
        `SELECT location_type, template_key FROM cashflow_location_type_templates ORDER BY location_type ASC`
      );

      // Group by template
      const templateMap = new Map();
      templates.forEach(t => {
        templateMap.set(t.template_key, {
          template_key: t.template_key,
          template_name: t.name,
          location_types: []
        });
      });

      mappings.forEach(m => {
        if (templateMap.has(m.template_key)) {
          templateMap.get(m.template_key).location_types.push(m.location_type);
        }
      });

      res.json(Array.from(templateMap.values()));
    } catch (error) {
      console.error('Error fetching location type templates:', error);
      res.status(500).json({ error: 'Failed to fetch location type templates' });
    }
  }
);

/* ======================================================
   SET TEMPLATE LOCATION TYPES (Assign multiple types to template)
   ====================================================== */
router.put(
  '/templates/:templateKey/location-types',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { templateKey } = req.params;
    const { location_types } = req.body;

    if (!templateKey || !templateKey.trim()) {
      return res.status(400).json({ error: 'Template key is required' });
    }

    if (!Array.isArray(location_types)) {
      return res.status(400).json({ error: 'location_types must be an array' });
    }

    const normalizedTypes = [...new Set(
      location_types
        .map(t => String(t || '').trim())
        .filter(t => t.length > 0)
    )];

    try {
      // Verify template exists
      const [[template]] = await db.query(
        'SELECT template_key FROM cashflow_templates WHERE template_key = ? AND active = 1',
        [templateKey]
      );
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      // Get current mappings for this template
      const [currentMappings] = await db.query(
        'SELECT location_type FROM cashflow_location_type_templates WHERE template_key = ?',
        [templateKey]
      );
      const currentTypes = new Set(currentMappings.map(m => m.location_type));

      // Types to add
      const typesToAdd = normalizedTypes.filter(t => !currentTypes.has(t));
      
      // Types to remove (were mapped to this template but not in new list)
      const typesToRemove = [...currentTypes].filter(t => !normalizedTypes.includes(t));

      // Add new mappings
      if (typesToAdd.length > 0) {
        await db.query(
          `INSERT INTO cashflow_location_type_templates (location_type, template_key)
           VALUES ${typesToAdd.map(() => '(?, ?)').join(', ')}
           ON DUPLICATE KEY UPDATE template_key = VALUES(template_key), updated_at = CURRENT_TIMESTAMP`,
          typesToAdd.flatMap(t => [t, templateKey])
        );
      }

      // Remove old mappings
      if (typesToRemove.length > 0) {
        await db.query(
          `DELETE FROM cashflow_location_type_templates 
           WHERE template_key = ? AND location_type IN (?)`,
          [templateKey, typesToRemove]
        );
      }

      // Update all existing cashflow locations with the newly assigned types
      let updatedLocationsCount = 0;
      if (normalizedTypes.length > 0) {
        try {
          const [result] = await db.query(
            `UPDATE cashflow_location_settings cls
             INNER JOIN locations l ON cls.location_id = l.id
             SET cls.template_key = ?
             WHERE l.type IN (?)
               AND cls.include_in_cashflow = 1`,
            [templateKey, normalizedTypes]
          );
          updatedLocationsCount = result.affectedRows || 0;
        } catch (updateError) {
          console.error('Error updating locations with new template:', updateError.message);
          // Don't fail the whole request if the update fails
        }
      }

      await logAudit({
        table_name: 'cashflow_location_type_templates',
        record_id: templateKey,
        action: 'UPDATE',
        new_data: {
          location_types: normalizedTypes,
          added: typesToAdd.length,
          removed: typesToRemove.length
        },
        changed_by: req.user.id,
        req
      });

      res.json({ 
        success: true, 
        template_key: templateKey, 
        location_types: normalizedTypes,
        added: typesToAdd.length,
        removed: typesToRemove.length,
        locations_updated: updatedLocationsCount
      });
    } catch (error) {
      console.error('Error setting template location types:', error);
      res.status(500).json({ error: 'Failed to set template location types' });
    }
  }
);

/* ======================================================
   REMOVE LOCATION TYPE TEMPLATE MAPPING
   ====================================================== */
router.delete(
  '/location-type-templates/:locationType',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { locationType } = req.params;

    if (!locationType || !locationType.trim()) {
      return res.status(400).json({ error: 'Location type is required' });
    }

    try {
      await db.query(
        'DELETE FROM cashflow_location_type_templates WHERE location_type = ?',
        [locationType.trim()]
      );

      await logAudit({
        table_name: 'cashflow_location_type_templates',
        record_id: locationType.trim(),
        action: 'DELETE',
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing location type template:', error);
      res.status(500).json({ error: 'Failed to remove location type template' });
    }
  }
);

/* ======================================================
   GET TEMPLATE FOR LOCATION TYPE (For auto-population)
   ====================================================== */
router.get(
  '/location-type-template/:locationType',
  authenticate,
  async (req, res) => {
    const { locationType } = req.params;

    if (!locationType) {
      return res.status(400).json({ error: 'Location type is required' });
    }

    try {
      const [mapping] = await db.query(
        `SELECT template_key FROM cashflow_location_type_templates
         WHERE location_type = ?`,
        [locationType]
      );

      if (mapping.length === 0) {
        return res.json({ template_key: null });
      }

      res.json({ template_key: mapping[0].template_key });
    } catch (error) {
      console.error('Error fetching location type template:', error);
      res.status(500).json({ error: 'Failed to fetch location type template' });
    }
  }
);

/* ======================================================
   GET LOCATION TYPES FOR TEMPLATE (For editing template)
   ====================================================== */
router.get(
  '/templates/:templateKey/location-types',
  authenticate,
  async (req, res) => {
    const { templateKey } = req.params;

    if (!templateKey) {
      return res.status(400).json({ error: 'Template key is required' });
    }

    try {
      const [mappings] = await db.query(
        `SELECT location_type FROM cashflow_location_type_templates
         WHERE template_key = ?
         ORDER BY location_type ASC`,
        [templateKey]
      );

      res.json({ location_types: mappings.map(m => m.location_type) });
    } catch (error) {
      console.error('Error fetching template location types:', error);
      res.status(500).json({ error: 'Failed to fetch template location types' });
    }
  }
);

module.exports = router;
