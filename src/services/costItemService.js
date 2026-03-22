const db = require('../db');

const CODE_LOCK_NAME = 'cost_item_code_generation';
const THREE_MONTH_COMPARISON_WINDOW = 3;

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeCode(value) {
  return normalizeText(value).replace(/\s+/g, '').toUpperCase();
}

function toMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function sanitizeTypeForCode(type) {
  const cleaned = normalizeText(type).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned;
}

function buildCodePrefixes(type) {
  const cleaned = sanitizeTypeForCode(type);
  if (!cleaned) {
    return [];
  }

  if (cleaned.length === 1) {
    return [cleaned + cleaned];
  }

  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  const candidates = [first + last];

  for (let index = cleaned.length - 2; index >= 1; index -= 1) {
    candidates.push(first + cleaned[index]);
  }

  for (let index = 1; index < cleaned.length - 1; index += 1) {
    candidates.push(first + cleaned[index]);
  }

  return [...new Set(candidates)];
}

async function acquireCodeGenerationLock(connection) {
  const [[row]] = await connection.query('SELECT GET_LOCK(?, 10) AS lock_acquired', [CODE_LOCK_NAME]);
  if (!row || Number(row.lock_acquired) !== 1) {
    throw new Error('Failed to acquire cost item code generation lock');
  }
}

async function releaseCodeGenerationLock(connection) {
  try {
    await connection.query('SELECT RELEASE_LOCK(?)', [CODE_LOCK_NAME]);
  } catch (error) {
    console.error('Failed to release cost item code generation lock:', error.message);
  }
}

async function generateUniqueCode(connection, type, excludeId = null) {
  const prefixes = buildCodePrefixes(type);
  if (!prefixes.length) {
    throw new Error('Type must contain at least one alphanumeric character to generate a code');
  }

  for (const prefix of prefixes) {
    const params = [`${prefix}%`];
    let sql = 'SELECT code FROM cost_items WHERE code LIKE ?';

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const [rows] = await connection.query(sql, params);
    const usedNumbers = new Set();

    for (const row of rows) {
      const code = String(row.code || '').toUpperCase();
      if (!code.startsWith(prefix)) {
        continue;
      }

      const suffix = code.slice(prefix.length);
      const numericSuffix = Number(suffix);
      if (Number.isInteger(numericSuffix) && numericSuffix > 0) {
        usedNumbers.add(numericSuffix);
      }
    }

    let candidateNumber = 1;
    while (usedNumbers.has(candidateNumber)) {
      candidateNumber += 1;
    }

    return `${prefix}${candidateNumber}`;
  }

  throw new Error('Failed to generate a unique cost item code');
}

function validateCostItemPayload(payload, { requireAllFields = true } = {}) {
  const type = normalizeText(payload?.type);
  const description = normalizeText(payload?.description);
  const unit = normalizeText(payload?.unit);
  const costPer = toMoney(payload?.cost_per ?? payload?.costPer);

  if ((requireAllFields || type) && !type) {
    return { error: 'type is required' };
  }

  if ((requireAllFields || description) && !description) {
    return { error: 'description is required' };
  }

  if ((requireAllFields || unit) && !unit) {
    return { error: 'unit is required' };
  }

  if (requireAllFields || payload?.cost_per !== undefined || payload?.costPer !== undefined) {
    if (costPer === null || costPer < 0) {
      return { error: 'cost_per must be a valid non-negative number' };
    }
  }

  return {
    value: {
      type,
      description,
      unit,
      cost_per: costPer
    }
  };
}

function determineComparisonStatus(deltaPercent, thresholds) {
  if (deltaPercent === null || deltaPercent <= 0) {
    return 'green';
  }

  if (deltaPercent > thresholds.red) {
    return 'red';
  }

  if (deltaPercent > thresholds.yellow) {
    return 'yellow';
  }

  return 'green';
}

async function getThresholds() {
  const [rows] = await db.query(
    `
    SELECT
      MAX(CASE WHEN \`key\` = 'cost_warning_yellow_threshold' THEN \`value\` END) AS yellow_threshold,
      MAX(CASE WHEN \`key\` = 'cost_warning_red_threshold' THEN \`value\` END) AS red_threshold
    FROM site_settings
    WHERE \`key\` IN ('cost_warning_yellow_threshold', 'cost_warning_red_threshold')
    `
  );

  const row = rows[0] || {};
  const yellow = Number(row.yellow_threshold);
  const red = Number(row.red_threshold);

  if (!Number.isFinite(yellow) || !Number.isFinite(red)) {
    throw new Error('Cost warning thresholds are not configured');
  }

  return {
    yellow,
    red
  };
}

async function listCostItems({ includeDeleted = false, deletedOnly = false } = {}) {
  const thresholds = await getThresholds();
  const filters = [];

  if (deletedOnly) {
    filters.push('ci.is_deleted = 1');
  } else if (!includeDeleted) {
    filters.push('ci.is_deleted = 0');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const [rows] = await db.query(
    `
    SELECT
      ci.id,
      ci.code,
      ci.type,
      ci.description,
      ci.cost_per,
      ci.unit,
      ci.last_updated,
      ci.is_deleted,
      ci.created_at,
      ci.updated_at,
      COUNT(recent.id) AS comparison_order_count,
      MAX(recent.po_date) AS comparison_last_po_date,
      MAX(tracked_recent.point_count) AS comparison_sample_count,
      MAX(tracked_recent.average_cost) AS comparison_average_cost,
      MAX(tracked_recent.min_cost) AS comparison_min_cost,
      MAX(tracked_recent.max_cost) AS comparison_max_cost,
      MAX(tracked_recent.latest_cost) AS comparison_latest_cost
    FROM cost_items ci
    LEFT JOIN (
      SELECT
        pli.id,
        pli.cost_item_id,
        pli.cost_item_code,
        pli.unit_price,
        po.po_date
      FROM po_line_items pli
      JOIN purchase_orders po ON po.id = pli.po_id
      WHERE po.po_date >= DATE_SUB(CURDATE(), INTERVAL ${THREE_MONTH_COMPARISON_WINDOW} MONTH)
        AND po.status NOT IN ('cancelled', 'draft')
    ) recent
      ON recent.cost_item_id = ci.id
      OR (recent.cost_item_id IS NULL AND recent.cost_item_code = ci.code)
    LEFT JOIN (
      SELECT
        points.cost_item_id,
        COUNT(*) AS point_count,
        AVG(points.point_cost) AS average_cost,
        MIN(points.point_cost) AS min_cost,
        MAX(points.point_cost) AS max_cost,
        SUBSTRING_INDEX(
          GROUP_CONCAT(points.point_cost ORDER BY points.point_at DESC, points.point_id DESC SEPARATOR ','),
          ',',
          1
        ) AS latest_cost
      FROM (
        SELECT
          COALESCE(pli.cost_item_id, ci_by_code.id) AS cost_item_id,
          pli.unit_price AS point_cost,
          po.po_date AS point_at,
          pli.id AS point_id
        FROM po_line_items pli
        JOIN purchase_orders po ON po.id = pli.po_id
        LEFT JOIN cost_items ci_by_code ON ci_by_code.code = pli.cost_item_code
        WHERE po.po_date >= DATE_SUB(CURDATE(), INTERVAL ${THREE_MONTH_COMPARISON_WINDOW} MONTH)
          AND po.status NOT IN ('cancelled', 'draft')
          AND COALESCE(pli.cost_item_id, ci_by_code.id) IS NOT NULL

        UNION ALL

        SELECT
          h.cost_item_id,
          h.new_cost_per AS point_cost,
          h.changed_at AS point_at,
          h.id AS point_id
        FROM cost_item_cost_history h
        WHERE h.changed_at >= DATE_SUB(CURDATE(), INTERVAL ${THREE_MONTH_COMPARISON_WINDOW} MONTH)
          AND h.change_source <> 'seed_po'
      ) points
      GROUP BY points.cost_item_id
    ) tracked_recent
      ON tracked_recent.cost_item_id = ci.id
    ${whereClause}
    GROUP BY
      ci.id,
      ci.code,
      ci.type,
      ci.description,
      ci.cost_per,
      ci.unit,
      ci.last_updated,
      ci.is_deleted,
      ci.created_at,
      ci.updated_at
    ORDER BY ci.type ASC, ci.description ASC, ci.code ASC
    `
  );

  return rows.map((row) => {
    const sampleCount = Number(row.comparison_sample_count || 0);
    const averageCost = row.comparison_average_cost === null ? null : Number(Number(row.comparison_average_cost).toFixed(2));
    const latestCost = row.comparison_latest_cost === null ? null : Number(Number(row.comparison_latest_cost).toFixed(2));
    const deltaPercent = averageCost && averageCost > 0
      ? Number((((Number(row.cost_per) - averageCost) / averageCost) * 100).toFixed(2))
      : null;

    return {
      id: row.id,
      code: row.code,
      type: row.type,
      description: row.description,
      cost_per: Number(row.cost_per),
      unit: row.unit,
      last_updated: row.last_updated,
      is_deleted: Number(row.is_deleted) === 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      comparison: {
        sample_count: sampleCount,
        order_count: Number(row.comparison_order_count || 0),
        average_cost: averageCost,
        latest_cost: latestCost,
        min_cost: row.comparison_min_cost === null ? null : Number(Number(row.comparison_min_cost).toFixed(2)),
        max_cost: row.comparison_max_cost === null ? null : Number(Number(row.comparison_max_cost).toFixed(2)),
        last_po_date: row.comparison_last_po_date || null,
        delta_percent: deltaPercent,
        status: determineComparisonStatus(deltaPercent, thresholds)
      }
    };
  });
}

async function getCostItemById(id, { includeDeleted = true } = {}) {
  const [rows] = await db.query(
    `
    SELECT id, code, type, description, cost_per, unit, last_updated, is_deleted, created_at, updated_at
    FROM cost_items
    WHERE id = ?
      ${includeDeleted ? '' : 'AND is_deleted = 0'}
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

async function assertUniqueCode(connection, code, excludeId = null) {
  const params = [code];
  let sql = 'SELECT id FROM cost_items WHERE code = ?';

  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }

  const [rows] = await connection.query(sql, params);
  if (rows.length > 0) {
    throw new Error(`Cost item code ${code} already exists`);
  }
}

async function recordCostChange(connection, { costItemId, oldCostPer, newCostPer, changedBy = null, changeSource = 'manual' }) {
  await connection.query(
    `
    INSERT INTO cost_item_cost_history (cost_item_id, old_cost_per, new_cost_per, changed_by, change_source)
    VALUES (?, ?, ?, ?, ?)
    `,
    [
      costItemId,
      Number(oldCostPer),
      Number(newCostPer),
      changedBy || null,
      String(changeSource || 'manual').slice(0, 30)
    ]
  );
}

async function createCostItem(payload, { connection = null, codeOverride = null } = {}) {
  const validation = validateCostItemPayload(payload);
  if (validation.error) {
    throw new Error(validation.error);
  }

  const ownConnection = !connection;
  const activeConnection = connection || await db.getConnection();

  try {
    if (ownConnection) {
      await activeConnection.beginTransaction();
    }

    await acquireCodeGenerationLock(activeConnection);

    const code = codeOverride
      ? normalizeCode(codeOverride)
      : await generateUniqueCode(activeConnection, validation.value.type);

    if (!code) {
      throw new Error('Failed to generate a valid cost item code');
    }

    await assertUniqueCode(activeConnection, code);

    const [result] = await activeConnection.query(
      `
      INSERT INTO cost_items (code, type, description, cost_per, unit, last_updated, is_deleted)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
      `,
      [
        code,
        validation.value.type,
        validation.value.description,
        validation.value.cost_per,
        validation.value.unit
      ]
    );

    await releaseCodeGenerationLock(activeConnection);

    if (ownConnection) {
      await activeConnection.commit();
    }

    return await getCostItemById(result.insertId);
  } catch (error) {
    await releaseCodeGenerationLock(activeConnection);
    if (ownConnection) {
      await activeConnection.rollback();
    }
    throw error;
  } finally {
    if (ownConnection) {
      activeConnection.release();
    }
  }
}

async function updateCostItem(id, payload, { connection = null, allowCodeChange = false, changedBy = null, changeSource = 'manual' } = {}) {
  const existing = await getCostItemById(id);
  if (!existing) {
    throw new Error('Cost item not found');
  }

  const validation = validateCostItemPayload(payload);
  if (validation.error) {
    throw new Error(validation.error);
  }

  const nextCode = allowCodeChange && payload?.code ? normalizeCode(payload.code) : existing.code;
  const costChanged = Number(existing.cost_per) !== Number(validation.value.cost_per);
  const ownConnection = !connection;
  const activeConnection = connection || await db.getConnection();

  try {
    if (ownConnection) {
      await activeConnection.beginTransaction();
    }

    if (allowCodeChange && nextCode !== existing.code) {
      await acquireCodeGenerationLock(activeConnection);
      await assertUniqueCode(activeConnection, nextCode, id);
    }

    await activeConnection.query(
      `
      UPDATE cost_items
      SET
        code = ?,
        type = ?,
        description = ?,
        cost_per = ?,
        unit = ?,
        last_updated = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE last_updated END
      WHERE id = ?
      `,
      [
        nextCode,
        validation.value.type,
        validation.value.description,
        validation.value.cost_per,
        validation.value.unit,
        costChanged ? 1 : 0,
        id
      ]
    );

    if (costChanged) {
      await recordCostChange(activeConnection, {
        costItemId: id,
        oldCostPer: existing.cost_per,
        newCostPer: validation.value.cost_per,
        changedBy,
        changeSource
      });
    }

    if (allowCodeChange && nextCode !== existing.code) {
      await activeConnection.query(
        'UPDATE po_line_items SET cost_item_code = ? WHERE cost_item_id = ?',
        [nextCode, id]
      );
    }

    await activeConnection.query(
      'UPDATE po_line_items SET cost_item_type = ? WHERE cost_item_id = ?',
      [validation.value.type, id]
    );

    if (ownConnection) {
      await activeConnection.commit();
    }

    if (allowCodeChange && nextCode !== existing.code) {
      await releaseCodeGenerationLock(activeConnection);
    }

    return {
      previous: existing,
      current: await getCostItemById(id)
    };
  } catch (error) {
    if (allowCodeChange && nextCode !== existing.code) {
      await releaseCodeGenerationLock(activeConnection);
    }
    if (ownConnection) {
      await activeConnection.rollback();
    }
    throw error;
  } finally {
    if (ownConnection) {
      activeConnection.release();
    }
  }
}

async function softDeleteCostItem(id) {
  const existing = await getCostItemById(id, { includeDeleted: false });
  if (!existing) {
    throw new Error('Cost item not found');
  }

  await db.query('UPDATE cost_items SET is_deleted = 1 WHERE id = ? AND is_deleted = 0', [id]);

  return {
    previous: existing,
    current: await getCostItemById(id)
  };
}

async function restoreCostItem(id) {
  const existing = await getCostItemById(id);
  if (!existing) {
    throw new Error('Cost item not found');
  }

  if (!Number(existing.is_deleted)) {
    return {
      previous: existing,
      current: existing
    };
  }

  await db.query('UPDATE cost_items SET is_deleted = 0 WHERE id = ?', [id]);

  return {
    previous: existing,
    current: await getCostItemById(id)
  };
}

async function permanentlyDeleteCostItem(id) {
  const existing = await getCostItemById(id);
  if (!existing) {
    throw new Error('Cost item not found');
  }

  await db.query('DELETE FROM cost_items WHERE id = ?', [id]);
  return existing;
}

async function getDistinctMetaValues(column) {
  if (!['type', 'unit'].includes(column)) {
    throw new Error('Unsupported meta column');
  }

  const [rows] = await db.query(
    `
    SELECT DISTINCT ${column} AS value
    FROM cost_items
    WHERE is_deleted = 0
      AND ${column} IS NOT NULL
      AND TRIM(${column}) != ''
    ORDER BY ${column} ASC
    `
  );

  return rows.map((row) => row.value);
}

async function searchCostItems(query) {
  const search = normalizeText(query);
  if (!search) {
    return [];
  }

  const [rows] = await db.query(
    `
    SELECT id, code, type, description, unit, cost_per
    FROM cost_items
    WHERE is_deleted = 0
      AND (
        code LIKE ?
        OR description LIKE ?
        OR type LIKE ?
      )
    ORDER BY
      CASE WHEN code LIKE ? THEN 0 ELSE 1 END,
      type ASC,
      description ASC,
      code ASC
    LIMIT 20
    `,
    [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    type: row.type,
    description: row.description,
    unit: row.unit,
    cost_per: Number(row.cost_per),
    label: `${row.code} | ${row.type} | ${row.description}`
  }));
}

async function getCostItemHistory(id, { limit = 24 } = {}) {
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new Error('Invalid cost item id');
  }

  const item = await getCostItemById(itemId);
  if (!item) {
    throw new Error('Cost item not found');
  }

  const requestedLimit = Number(limit);
  const safeLimit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(100, requestedLimit))
    : 24;

  const [rows] = await db.query(
    `
    SELECT point_cost, point_at, source
    FROM (
      SELECT
        pli.unit_price AS point_cost,
        po.po_date AS point_at,
        'po' AS source,
        pli.id AS point_id
      FROM po_line_items pli
      JOIN purchase_orders po ON po.id = pli.po_id
      WHERE po.po_date >= DATE_SUB(CURDATE(), INTERVAL ${THREE_MONTH_COMPARISON_WINDOW} MONTH)
        AND po.status NOT IN ('cancelled', 'draft')
        AND (
          pli.cost_item_id = ?
          OR (pli.cost_item_id IS NULL AND pli.cost_item_code = ?)
        )

      UNION ALL

      SELECT
        h.new_cost_per AS point_cost,
        h.changed_at AS point_at,
        'manual' AS source,
        h.id AS point_id
      FROM cost_item_cost_history h
      WHERE h.cost_item_id = ?
        AND h.changed_at >= DATE_SUB(CURDATE(), INTERVAL ${THREE_MONTH_COMPARISON_WINDOW} MONTH)
        AND h.change_source <> 'seed_po'
    ) points
    ORDER BY points.point_at DESC, points.point_id DESC
    LIMIT ?
    `,
    [itemId, item.code, itemId, safeLimit]
  );

  const historyRows = rows.slice().reverse();
  const points = [];

  if (historyRows.length > 0) {
    historyRows.forEach((row) => {
      points.push({
        at: row.point_at,
        cost_per: Number(row.point_cost),
        source: String(row.source || 'manual')
      });
    });
  } else {
    points.push({
      at: item.last_updated || item.updated_at || item.created_at,
      cost_per: Number(item.cost_per),
      source: 'current'
    });
  }

  return {
    item_id: item.id,
    code: item.code,
    points
  };
}

async function getCurrentCostsReport({
  type = '',
  status = '',
  search = '',
  dateFrom = '',
  dateTo = ''
} = {}) {
  const normalizedType = normalizeText(type);
  const normalizedStatus = normalizeText(status).toLowerCase();
  const normalizedSearch = normalizeText(search).toLowerCase();

  let fromDate = normalizeText(dateFrom);
  let toDate = normalizeText(dateTo);

  if (!fromDate) {
    const fallbackFrom = new Date();
    fallbackFrom.setMonth(fallbackFrom.getMonth() - 6);
    fromDate = fallbackFrom.toISOString().slice(0, 10);
  }

  if (!toDate) {
    toDate = new Date().toISOString().slice(0, 10);
  }

  const allItems = await listCostItems({ includeDeleted: false });
  const typeOptions = [...new Set(allItems.map((item) => item.type).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const filteredItems = allItems.filter((item) => {
    const matchesType = !normalizedType || item.type === normalizedType;
    const matchesStatus = !normalizedStatus || (item.comparison?.status || '') === normalizedStatus;
    const matchesSearch = !normalizedSearch || [item.code, item.description, item.type]
      .some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    return matchesType && matchesStatus && matchesSearch;
  });

  if (filteredItems.length === 0) {
    return {
      filters: { type: normalizedType, status: normalizedStatus, search: normalizedSearch, date_from: fromDate, date_to: toDate },
      type_options: typeOptions,
      summary: {
        total_items: 0,
        tracked_items: 0,
        green_count: 0,
        yellow_count: 0,
        red_count: 0,
        avg_delta_percent: 0,
        rising_count: 0,
        falling_count: 0,
        stable_count: 0
      },
      overlay_points: [],
      items: [],
      top_movers: []
    };
  }

  const itemIds = filteredItems.map((item) => Number(item.id));
  const [pointRows] = await db.query(
    `
    SELECT
      points.cost_item_id,
      points.point_cost,
      points.point_at,
      points.source,
      points.point_id
    FROM (
      SELECT
        COALESCE(pli.cost_item_id, ci_by_code.id) AS cost_item_id,
        pli.unit_price AS point_cost,
        po.po_date AS point_at,
        'po' AS source,
        pli.id AS point_id
      FROM po_line_items pli
      JOIN purchase_orders po ON po.id = pli.po_id
      LEFT JOIN cost_items ci_by_code ON ci_by_code.code = pli.cost_item_code
      WHERE po.po_date >= ?
        AND po.po_date <= ?
        AND po.status NOT IN ('cancelled', 'draft')
        AND COALESCE(pli.cost_item_id, ci_by_code.id) IN (?)

      UNION ALL

      SELECT
        h.cost_item_id,
        h.new_cost_per AS point_cost,
        h.changed_at AS point_at,
        'manual' AS source,
        h.id AS point_id
      FROM cost_item_cost_history h
      WHERE h.changed_at >= ?
        AND h.changed_at < DATE_ADD(?, INTERVAL 1 DAY)
        AND h.change_source <> 'seed_po'
        AND h.cost_item_id IN (?)
    ) points
    ORDER BY points.cost_item_id ASC, points.point_at ASC, points.point_id ASC
    `,
    [fromDate, toDate, itemIds, fromDate, toDate, itemIds]
  );

  const pointMap = new Map();
  pointRows.forEach((row) => {
    const id = Number(row.cost_item_id);
    if (!pointMap.has(id)) {
      pointMap.set(id, []);
    }
    pointMap.get(id).push({
      at: row.point_at,
      cost_per: Number(Number(row.point_cost).toFixed(2)),
      source: row.source
    });
  });

  const overlayBuckets = new Map();
  pointRows.forEach((row) => {
    const key = new Date(row.point_at).toISOString().slice(0, 10);
    if (!overlayBuckets.has(key)) {
      overlayBuckets.set(key, { sum: 0, count: 0 });
    }
    const bucket = overlayBuckets.get(key);
    bucket.sum += Number(row.point_cost);
    bucket.count += 1;
  });

  const overlayPoints = [...overlayBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([at, bucket]) => ({
      at,
      average_cost: Number((bucket.sum / (bucket.count || 1)).toFixed(2)),
      count: bucket.count
    }));

  const items = filteredItems.map((item) => ({
    ...item,
    trend_points: pointMap.get(Number(item.id)) || []
  }));

  const risingCount = items.filter((item) => Number(item.comparison?.delta_percent) > 0).length;
  const fallingCount = items.filter((item) => Number(item.comparison?.delta_percent) < 0).length;
  const stableCount = items.length - risingCount - fallingCount;
  const deltas = items
    .map((item) => Number(item.comparison?.delta_percent))
    .filter((value) => Number.isFinite(value));

  const summary = {
    total_items: items.length,
    tracked_items: items.filter((item) => item.trend_points.length > 0).length,
    green_count: items.filter((item) => item.comparison?.status === 'green').length,
    yellow_count: items.filter((item) => item.comparison?.status === 'yellow').length,
    red_count: items.filter((item) => item.comparison?.status === 'red').length,
    avg_delta_percent: deltas.length
      ? Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(2))
      : 0,
    rising_count: risingCount,
    falling_count: fallingCount,
    stable_count: stableCount
  };

  const topMovers = [...items]
    .filter((item) => Number.isFinite(Number(item.comparison?.delta_percent)))
    .sort((a, b) => Math.abs(Number(b.comparison.delta_percent)) - Math.abs(Number(a.comparison.delta_percent)))
    .slice(0, 15)
    .map((item) => ({
      id: item.id,
      code: item.code,
      type: item.type,
      description: item.description,
      unit: item.unit,
      cost_per: item.cost_per,
      comparison: item.comparison
    }));

  return {
    filters: {
      type: normalizedType,
      status: normalizedStatus,
      search: normalizedSearch,
      date_from: fromDate,
      date_to: toDate
    },
    type_options: typeOptions,
    summary,
    overlay_points: overlayPoints,
    items,
    top_movers: topMovers
  };
}

async function mergeTypes({ keepType, mergeType }) {
  const normalizedKeepType = normalizeText(keepType);
  const normalizedMergeType = normalizeText(mergeType);

  if (!normalizedKeepType || !normalizedMergeType) {
    throw new Error('keepType and mergeType are required');
  }

  if (normalizedKeepType.toLowerCase() === normalizedMergeType.toLowerCase()) {
    throw new Error('Cannot merge a type into itself');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [itemsToMerge] = await connection.query(
      'SELECT id, code, type, description FROM cost_items WHERE type = ?',
      [normalizedMergeType]
    );

    if (itemsToMerge.length === 0) {
      throw new Error('No cost items found for the selected merge type');
    }

    await connection.query('UPDATE cost_items SET type = ? WHERE type = ?', [normalizedKeepType, normalizedMergeType]);
    await connection.query('UPDATE po_line_items SET cost_item_type = ? WHERE cost_item_type = ?', [normalizedKeepType, normalizedMergeType]);

    await connection.commit();
    return itemsToMerge;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createCostItem,
  generateUniqueCode,
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
};