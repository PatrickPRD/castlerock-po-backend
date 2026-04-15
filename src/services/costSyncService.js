/**
 * Sync cost items from line items — updates cost_items.cost_per and
 * records a history row in cost_item_cost_history when prices change.
 *
 * Shared by purchase order creation/update and template creation/update.
 *
 * @param {object}  connection    - MySQL transaction connection
 * @param {Array}   lineItems     - Normalized line items with cost_item_id/cost_item_code/unit_price
 * @param {number}  changedBy     - User ID making the change
 * @param {string}  changeSource  - History source label (e.g. 'po_line_item', 'po_template')
 * @param {number|null} poId      - Originating PO id (null for templates)
 */
async function syncCostItemsFromLineItems(connection, lineItems, changedBy, changeSource = 'po_line_item', poId = null) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return;
  }

  const latestByKey = new Map();

  lineItems.forEach((item) => {
    const unitPrice = Number(item.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return;
    }

    const normalizedPrice = Number(unitPrice.toFixed(2));
    const key = item.cost_item_id
      ? `id:${item.cost_item_id}`
      : (item.cost_item_code ? `code:${item.cost_item_code}` : null);

    if (!key) {
      return;
    }

    latestByKey.set(key, {
      cost_item_id: item.cost_item_id || null,
      cost_item_code: item.cost_item_code || null,
      unit_price: normalizedPrice,
      line_number: item.line_number || null
    });
  });

  if (latestByKey.size === 0) {
    return;
  }

  const targetIds = [...new Set(
    [...latestByKey.values()]
      .map((item) => Number(item.cost_item_id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  const targetCodes = [...new Set(
    [...latestByKey.values()]
      .map((item) => String(item.cost_item_code || '').trim().toUpperCase())
      .filter(Boolean)
  )];

  const whereParts = [];
  const params = [];

  if (targetIds.length > 0) {
    whereParts.push('id IN (?)');
    params.push(targetIds);
  }

  if (targetCodes.length > 0) {
    whereParts.push('code IN (?)');
    params.push(targetCodes);
  }

  if (whereParts.length === 0) {
    return;
  }

  const [existingRows] = await connection.query(
    `
    SELECT id, code, cost_per
    FROM cost_items
    WHERE is_deleted = 0
      AND (${whereParts.join(' OR ')})
    `,
    params
  );

  const byId = new Map();
  const byCode = new Map();
  existingRows.forEach((row) => {
    byId.set(Number(row.id), row);
    byCode.set(String(row.code || '').toUpperCase(), row);
  });

  for (const item of latestByKey.values()) {
    const matched = item.cost_item_id
      ? byId.get(Number(item.cost_item_id))
      : byCode.get(String(item.cost_item_code || '').toUpperCase());

    if (!matched) {
      continue;
    }

    const oldCost = Number(matched.cost_per);
    const newCost = Number(item.unit_price);

    if (!Number.isFinite(oldCost) || !Number.isFinite(newCost) || oldCost === newCost) {
      continue;
    }

    await connection.query(
      'UPDATE cost_items SET cost_per = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
      [newCost, matched.id]
    );

    await connection.query(
      `
      INSERT INTO cost_item_cost_history (cost_item_id, old_cost_per, new_cost_per, changed_by, change_source, po_id, po_line_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [matched.id, oldCost, newCost, changedBy || null, changeSource, poId || null, item.line_number || null]
    );
  }
}

module.exports = { syncCostItemsFromLineItems };
