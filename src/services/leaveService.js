const db = require('../db');

async function ensureLeaveDefaults() {
  await db.query(
    "INSERT INTO po_stages (name, active) SELECT 'Site', 1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM po_stages WHERE name = 'Site')"
  );

  await db.query(
    `
    INSERT INTO locations (name, type, site_id, active)
    SELECT 'Site', 'system', s.id, 1
    FROM sites s
    WHERE NOT EXISTS (
      SELECT 1
      FROM locations l
      WHERE l.site_id = s.id
        AND l.name = 'Site'
    )
    `
  );
}

module.exports = {
  ensureLeaveDefaults
};
