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

  await conn.query(
    `
    UPDATE po_sequences
    SET last_number = last_number + 1
    WHERE site_id = ?
      AND year = ?
      AND month = ?
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

  return (
    site.site_letter +
    yearDigit +
    String(month).padStart(2, '0') +
    String(seq.last_number).padStart(3, '0')
  );
}

module.exports = { generatePONumber };
