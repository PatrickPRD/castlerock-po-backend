async function generatePONumber(conn, siteId) {

  const [[site]] = await conn.query(
    'SELECT site_letter FROM sites WHERE id = ?',
    [siteId]
  );

  if (!site) {
    throw new Error('Invalid site ID');
  }

  const now = new Date();
  const year = now.getFullYear();
  const yearDigit = year.toString().slice(-1);
  const month = now.getMonth() + 1;

  await conn.query(
    `
    INSERT INTO po_sequences (site_id, year, month, last_number)
    VALUES (?, ?, ?, 0)
    ON DUPLICATE KEY UPDATE last_number = last_number
    `,
    [siteId, year, month]
  );

  const [[seq]] = await conn.query(
    `
    SELECT last_number
    FROM po_sequences
    WHERE site_id = ?
      AND year = ?
      AND month = ?
    FOR UPDATE
    `,
    [siteId, year, month]
  );

  const prefix = site.site_letter + yearDigit + String(month);
  const likePattern = `${prefix}%`;
  const suffixStartPos = prefix.length + 1;

  const [[maxRow]] = await conn.query(
    `
    SELECT MAX(CAST(SUBSTRING(po_number, ?) AS UNSIGNED)) AS max_number
    FROM purchase_orders
    WHERE po_number LIKE ?
    `,
    [suffixStartPos, likePattern]
  );

  const maxExistingNumber = Number(maxRow?.max_number || 0);
  const currentSequence = Number(seq?.last_number || 0);
  const nextNumber = Math.max(currentSequence, maxExistingNumber) + 1;

  await conn.query(
    `
    UPDATE po_sequences
    SET last_number = ?
    WHERE site_id = ?
      AND year = ?
      AND month = ?
    `,
    [nextNumber, siteId, year, month]
  );

  return (
    prefix +
    String(nextNumber).padStart(3, '0')
  );
}

module.exports = { generatePONumber };
