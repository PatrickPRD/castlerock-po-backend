const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
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

  const normalized = rows.map((row) => ({
    stage: String(row?.stage || '').trim(),
    percent: Number(row?.percent),
    weeks: Number(row?.weeks)
  }));

  if (normalized.some((row) => !row.stage)) return null;
  if (normalized.some((row) => !Number.isFinite(row.percent) || row.percent < 0)) return null;
  if (normalized.some((row) => !Number.isInteger(row.weeks) || row.weeks <= 0)) return null;

  const percentTotal = Number(normalized.reduce((sum, row) => sum + row.percent, 0).toFixed(2));
  if (Math.abs(percentTotal - 100) > 0.05) return null;

  return normalized;
}

function buildWeeklySpreadFromRows(rows) {
  const spread = [];
  rows.forEach((row) => {
    const evenWeekValue = Number((row.percent / row.weeks).toFixed(4));
    for (let index = 0; index < row.weeks; index += 1) {
      spread.push(evenWeekValue);
    }
  });

  const rounded = spread.map((value) => Number(value.toFixed(2)));
  const roundedTotal = rounded.reduce((sum, value) => sum + value, 0);
  const diff = Number((100 - roundedTotal).toFixed(2));
  if (rounded.length > 0) {
    rounded[rounded.length - 1] = Number((rounded[rounded.length - 1] + diff).toFixed(2));
  }
  return rounded;
}

function toTemplateDto(row) {
  const templateRows = parseTemplateRows(row.template_rows_json) || [];
  return {
    key: row.template_key,
    name: row.name,
    week_count: Number(row.week_count),
    default_spread: parseWeeklySpread(row.default_spread_json) || [],
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

    const normalizedWeekCount = normalizedRows.reduce((sum, row) => sum + row.weeks, 0);
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

    const normalizedWeekCount = normalizedRows.reduce((sum, row) => sum + row.weeks, 0);
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
      const templates = await loadTemplates();

      const [[overall]] = await db.query(
        `SELECT overall_start_date, overall_start_value
         FROM cashflow_settings
         WHERE id = 1`
      );

      const [rows] = await db.query(
        `SELECT
          l.id AS location_id,
          l.name AS location_name,
          s.id AS site_id,
          s.name AS site_name,
          COALESCE(cls.include_in_cashflow, 0) AS include_in_cashflow,
          cls.estimated_construction_cost,
          cls.predicted_spend_percentage,
          cls.spend_timescale_months,
          cls.selling_price,
          cls.template_key,
          cls.weekly_spread_json
         FROM locations l
         JOIN sites s ON s.id = l.site_id
         LEFT JOIN cashflow_location_settings cls ON cls.location_id = l.id
         ORDER BY s.name, l.name`
      );

      res.json({
        overall_start_date: overall?.overall_start_date || null,
        overall_start_value: overall?.overall_start_value === null || overall?.overall_start_value === undefined
          ? null
          : Number(overall.overall_start_value),
        templates,
        locations: rows.map((row) => ({
          location_id: row.location_id,
          location_name: row.location_name,
          site_id: row.site_id,
          site_name: row.site_name,
          include_in_cashflow: Number(row.include_in_cashflow) === 1,
          estimated_construction_cost: row.estimated_construction_cost === null ? null : Number(row.estimated_construction_cost),
          predicted_spend_percentage: row.predicted_spend_percentage === null ? null : Number(row.predicted_spend_percentage),
          spend_timescale_months: row.spend_timescale_months === null ? null : Number(row.spend_timescale_months),
          selling_price: row.selling_price === null ? null : Number(row.selling_price),
          template_key: row.template_key || null,
          weekly_spread: parseWeeklySpread(row.weekly_spread_json)
        }))
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
    const { overallStartDate, overallStartValue, locations } = req.body || {};

    const normalizedStartDate = normalizeDate(overallStartDate);
    if (overallStartDate && !normalizedStartDate) {
      return res.status(400).json({ error: 'overallStartDate must be in YYYY-MM-DD format' });
    }

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
      const templates = await loadTemplates();
      const templateMap = new Map(templates.map((template) => [template.key, template]));

      for (const item of locations) {
        const locationId = Number(item?.location_id);
        if (!Number.isInteger(locationId) || locationId <= 0) {
          return res.status(400).json({ error: 'Each location must include a valid location_id' });
        }

        const estimatedConstructionCost = toNullableNumber(item?.estimated_construction_cost);
        const predictedSpendPercentage = toNullableNumber(item?.predicted_spend_percentage);
        const spendTimescaleMonths = toNullableNumber(item?.spend_timescale_months);
        const sellingPrice = toNullableNumber(item?.selling_price);
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

        if (item?.include_in_cashflow) {
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
        }
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
          [normalizedStartDate, normalizedStartValue]
        );

        for (const item of locations) {
          await connection.query(
            `INSERT INTO cashflow_location_settings (
              location_id,
              include_in_cashflow,
              estimated_construction_cost,
              predicted_spend_percentage,
              spend_timescale_months,
              selling_price,
              template_key,
              weekly_spread_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              include_in_cashflow = VALUES(include_in_cashflow),
              estimated_construction_cost = VALUES(estimated_construction_cost),
              predicted_spend_percentage = VALUES(predicted_spend_percentage),
              spend_timescale_months = VALUES(spend_timescale_months),
              selling_price = VALUES(selling_price),
              template_key = VALUES(template_key),
              weekly_spread_json = VALUES(weekly_spread_json)`,
            [
              Number(item.location_id),
              item.include_in_cashflow ? 1 : 0,
              toNullableNumber(item.estimated_construction_cost),
              toNullableNumber(item.predicted_spend_percentage),
              toNullableNumber(item.spend_timescale_months),
              toNullableNumber(item.selling_price),
              item.include_in_cashflow ? String(item.template_key || '') : null,
              item.include_in_cashflow && Array.isArray(item.weekly_spread)
                ? JSON.stringify(item.weekly_spread.map((entry) => Number(entry)))
                : null
            ]
          );
        }

        await connection.commit();
        res.json({ success: true });
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

module.exports = router;
