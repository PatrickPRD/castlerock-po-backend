const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');
const crypto = require('crypto');
const { sendPasswordSetupEmail } =
  require('../services/userEmailService');





/* ======================================================
   USERS – SUPER ADMIN ONLY
   ====================================================== */
router.get(
  '/users',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const [users] = await db.query(`
        SELECT
          id,
          email,
          first_name,
          last_name,
          role,
          active
        FROM users
        ORDER BY created_at DESC
      `);

      res.json(users);

    } catch (err) {
      console.error('LOAD USERS ERROR:', err);
      res.status(500).json({
        error: 'Failed to load users'
      });
    }
  }
);


router.post(
  '/users',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { email, role, first_name, last_name } = req.body;

    try {
      // Enforce single Super Admin
      if (role === 'super_admin') {
        const [existing] = await db.query(
          "SELECT id FROM users WHERE role = 'super_admin' LIMIT 1"
        );
        if (existing.length > 0) {
          return res.status(400).json({
            error: 'A Super Admin already exists'
          });
        }
      }

      // 🔐 Generate password setup token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // ✅ Create user
      const [result] = await db.query(
        `INSERT INTO users
         (email, role, first_name, last_name, reset_token, reset_token_expires, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [
          email,
          role,
          first_name,
          last_name,
          resetToken,
          resetExpires
        ]
      );

      // 📧 Try to send email (non-fatal)
      try {
        await sendPasswordSetupEmail(email, resetToken);
      } catch (emailErr) {
        console.error('EMAIL FAILED (non-fatal):', emailErr.message);
      }

      // ✅ Respond ONCE
      return res.json({
        success: true,
        userId: result.insertId
      });

    } catch (err) {
      console.error('CREATE USER ERROR:', err);

      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: 'Email already exists'
        });
      }

      return res.status(500).json({
        error: 'Failed to create user'
      });
    }
  }
);


router.put(
  '/users/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {

    const { email, role, first_name, last_name, active } = req.body;
    const userId = Number(req.params.id);
    const actingUserId = req.user.id;

    // Load target user
    const [[target]] = await db.query(
      `SELECT id, role, active FROM users WHERE id = ?`,
      [userId]
    );

    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

/* ======================================================
   EMAIL UNIQUENESS CHECK
   ====================================================== */
if (email) {
  const [[existing]] = await db.query(
    `SELECT id FROM users WHERE email = ? AND id <> ?`,
    [email, userId]
  );

  if (existing) {
    return res.status(400).json({
      error: 'This email address is already in use'
    });
  }
}



    /* ======================================================
       ❌ RULE 1: Super Admin cannot disable themselves
       ====================================================== */
    if (
      userId === actingUserId &&
      active === 0
    ) {
      return res.status(400).json({
        error: 'You cannot disable your own account'
      });
    }

    /* ======================================================
       ❌ RULE 2: Cannot disable the only Super Admin
       ====================================================== */
    if (target.role === 'super_admin' && active === 0) {
      const [[count]] = await db.query(
        `SELECT COUNT(*) AS total
         FROM users
         WHERE role = 'super_admin' AND active = 1`
      );

      if (count.total <= 1) {
        return res.status(400).json({
          error: 'You cannot disable the only Super Admin'
        });
      }
    }

    /* ======================================================
       ❌ RULE 3: Only one Super Admin total
       ====================================================== */
    if (role === 'super_admin') {
      const [[existing]] = await db.query(
        `SELECT COUNT(*) AS total
         FROM users
         WHERE role = 'super_admin' AND id <> ?`,
        [userId]
      );

      if (existing.total > 0) {
        return res.status(400).json({
          error: 'A Super Admin already exists'
        });
      }
    }
/* ======================================================
   ❌ RULE 4: Cannot demote the only Super Admin
   ====================================================== */
if (target.role === 'super_admin' && role && role !== 'super_admin') {

  const [[count]] = await db.query(
    `
    SELECT COUNT(*) AS total
    FROM users
    WHERE role = 'super_admin' AND active = 1
    `
  );

  if (count.total <= 1) {
    return res.status(400).json({
      error: 'You cannot demote the only Super Admin'
    });
  }
}

    /* ======================================================
       UPDATE USER
       ====================================================== */
    await db.query(
      `
      UPDATE users
SET
  email      = COALESCE(?, email),
  role       = COALESCE(?, role),
  first_name = COALESCE(?, first_name),
  last_name  = COALESCE(?, last_name),
  active     = COALESCE(?, active)
WHERE id = ?

      `,
      [
  email,
  role,
  first_name,
  last_name,
  active,
  userId
]

    );

    res.json({ success: true });
  }
);

/* ======================================================
   DELETE USER – SUPER ADMIN ONLY
   ====================================================== */
router.delete(
  '/users/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const userId = Number(req.params.id);
    const currentUserId = req.user.id;

    try {
      // 🔒 Prevent deleting yourself
      if (userId === currentUserId) {
        return res.status(400).json({
          error: 'You cannot delete your own account'
        });
      }

      // 🔒 Check if user exists
      const [users] = await db.query(
        'SELECT id, role FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // 🔒 Prevent deleting the only super_admin
      if (users[0].role === 'super_admin') {
        const [[count]] = await db.query(
          "SELECT COUNT(*) AS total FROM users WHERE role = 'super_admin'"
        );

        if (count.total <= 1) {
          return res.status(400).json({
            error: 'Cannot delete the only Super Admin'
          });
        }
      }

      // ✅ Delete user
      await db.query('DELETE FROM users WHERE id = ?', [userId]);

      return res.json({ success: true });

    } catch (err) {
      console.error('DELETE USER ERROR:', err);
      return res.status(500).json({
        error: 'Failed to delete user'
      });
    }
  }
);


/* ======================================================
   SITES – SUPER ADMIN ONLY
   ====================================================== */

router.get(
  '/sites',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const [rows] = await db.query(
      `SELECT id, name, site_letter, address, active
       FROM sites
       ORDER BY name`
    );
    res.json(rows);
  }
);

router.post(
  '/sites',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { name, site_code, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Site name is required' });
    }

    if (!site_code || site_code.length !== 1) {
      return res.status(400).json({
        error: 'Site letter is required and must be a single character'
      });
    }

    try {
      await db.query(
        `INSERT INTO sites (name, site_letter, address)
         VALUES (?, ?, ?)`,
        [name.trim(), site_code.toUpperCase(), address || null]
      );

      res.json({ success: true });

    } catch (err) {
      // 🔒 Unique constraint on site_letter
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: 'This site letter is already in use'
        });
      }

      console.error(err);
      res.status(500).json({ error: 'Failed to create site' });
    }
  }
);

/* ======================================================
   UPDATE SITE NAME (LETTER LOCKED)
   ====================================================== */
router.put(
  '/sites/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const siteId = req.params.id;
    const { name, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Site name is required' });
    }

    await db.query(
      `UPDATE sites
       SET name = ?, address = ?
       WHERE id = ?`,
      [name.trim(), address || null, siteId]
    );

    res.json({ success: true });
  }
);



/* ❌ DELETE SITE – BLOCK IF ACTIVE POs EXIST */
router.delete(
  '/sites/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const siteId = req.params.id;

    const [rows] = await db.query(
      `
      SELECT COUNT(*) AS count
      FROM purchase_orders po
      JOIN locations l ON po.location_id = l.id
      WHERE l.site_id = ?
      `,
      [siteId]
    );

    if (rows[0].count > 0) {
      return res.status(400).json({
        error: 'This site cannot be deleted because it has active Purchase Orders'
      });
    }

    await db.query(
      `DELETE FROM sites WHERE id = ?`,
      [siteId]
    );

    res.json({ success: true });
  }
);

/* ======================================================
   STAGES – SUPER ADMIN
   ====================================================== */

router.get(
  '/stages',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const [rows] = await db.query(
      `SELECT s.id, s.name, s.active,
              COUNT(CASE WHEN po.status IN ('Issued', 'open', 'approved', 'received') THEN 1 END) AS po_count
       FROM po_stages s
       LEFT JOIN purchase_orders po ON s.id = po.stage_id
       GROUP BY s.id, s.name, s.active
       ORDER BY s.name`
    );
    res.json(rows);
  }
);

router.post(
  '/stages',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { name, active } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Stage name is required'
      });
    }

    await db.query(
      `INSERT INTO po_stages (name, active)
       VALUES (?, ?)`,
      [name.trim(), active ? 1 : 0]
    );

    res.json({ success: true });
  }
);

router.put(
  '/stages/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const stageId = req.params.id;
    const { name, active } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Stage name is required'
      });
    }

    await db.query(
      `UPDATE po_stages
       SET name = ?, active = ?
       WHERE id = ?`,
      [name.trim(), active ? 1 : 0, stageId]
    );

    res.json({ success: true });
  }
);

router.delete(
  '/stages/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const stageId = req.params.id;

    const [rows] = await db.query(
      `SELECT COUNT(*) AS count
       FROM purchase_orders
       WHERE stage_id = ?`,
      [stageId]
    );

    if (rows[0].count > 0) {
      return res.status(400).json({
        error: 'This stage cannot be deleted because it has associated Purchase Orders. Please use the merge feature to move POs to another stage first.'
      });
    }

    await db.query(
      `DELETE FROM po_stages WHERE id = ?`,
      [stageId]
    );

    res.json({ success: true });
  }
);

/* ======================================================
   WORKERS – SUPER ADMIN ONLY
   ====================================================== */

router.get(
  '/workers',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const includeInactive = String(req.query.include_inactive) === '1';
    const whereClause = includeInactive ? '' : 'WHERE active = 1';

    try {
      const [rows] = await db.query(
        `SELECT
           id,
           first_name,
           last_name,
           pps_number,
           weekly_take_home,
           date_of_employment,
           employee_id,
           notes,
           active,
           left_at
         FROM workers
         ${whereClause}
         ORDER BY last_name, first_name`
      );

      res.json(rows);
    } catch (err) {
      console.error('LOAD WORKERS ERROR:', err);
      res.status(500).json({ error: 'Failed to load workers' });
    }
  }
);

router.post(
  '/workers',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const {
      first_name,
      last_name,
      pps_number,
      weekly_take_home,
      date_of_employment,
      employee_id,
      notes
    } = req.body;

    if (!first_name || !first_name.trim() || !last_name || !last_name.trim()) {
      return res.status(400).json({ error: 'First and last name are required' });
    }

    try {
      await db.query(
        `INSERT INTO workers
         (first_name, last_name, pps_number, weekly_take_home, date_of_employment, employee_id, notes, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          first_name.trim(),
          last_name.trim(),
          pps_number || null,
          weekly_take_home ?? null,
          date_of_employment || null,
          employee_id || null,
          notes || null
        ]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('CREATE WORKER ERROR:', err);
      res.status(500).json({ error: 'Failed to create worker' });
    }
  }
);

router.put(
  '/workers/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const workerId = Number(req.params.id);
    const {
      first_name,
      last_name,
      pps_number,
      weekly_take_home,
      date_of_employment,
      employee_id,
      notes
    } = req.body;

    if (!first_name || !first_name.trim() || !last_name || !last_name.trim()) {
      return res.status(400).json({ error: 'First and last name are required' });
    }

    try {
      await db.query(
        `UPDATE workers
         SET
           first_name = ?,
           last_name = ?,
           pps_number = ?,
           weekly_take_home = ?,
           date_of_employment = ?,
           employee_id = ?,
           notes = ?
         WHERE id = ?`,
        [
          first_name.trim(),
          last_name.trim(),
          pps_number || null,
          weekly_take_home ?? null,
          date_of_employment || null,
          employee_id || null,
          notes || null,
          workerId
        ]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('UPDATE WORKER ERROR:', err);
      res.status(500).json({ error: 'Failed to update worker' });
    }
  }
);

router.put(
  '/workers/:id/status',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const workerId = Number(req.params.id);
    const active = Number(req.body.active) === 1 ? 1 : 0;

    try {
      await db.query(
        `UPDATE workers
         SET active = ?, left_at = ?
         WHERE id = ?`,
        [active, active ? null : new Date(), workerId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error('UPDATE WORKER STATUS ERROR:', err);
      res.status(500).json({ error: 'Failed to update worker status' });
    }
  }
);

/* ======================================================
   MERGE STAGES – SUPER ADMIN ONLY
   ====================================================== */
router.post(
  '/merge-stages',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { keep_stage_id, merge_stage_id } = req.body;
    let connection;

    try {
      if (!keep_stage_id || !merge_stage_id) {
        return res.status(400).json({
          error: 'Both stages are required'
        });
      }

      if (keep_stage_id === merge_stage_id) {
        return res.status(400).json({
          error: 'Cannot merge a stage into itself'
        });
      }

      connection = await db.getConnection();
      await connection.beginTransaction();

      // Update all POs from merge_stage to keep_stage
      await connection.query(
        `UPDATE purchase_orders
         SET stage_id = ?
         WHERE stage_id = ?`,
        [keep_stage_id, merge_stage_id]
      );

      // Delete the merged stage
      await connection.query(
        `DELETE FROM po_stages WHERE id = ?`,
        [merge_stage_id]
      );

      await connection.commit();

      res.json({ success: true });
    } catch (error) {
      if (connection) await connection.rollback();
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }
);

/* ======================================================
   LOCATIONS – SUPER ADMIN
   ====================================================== */

router.get(
  '/locations',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const [rows] = await db.query(
      `SELECT l.id, l.name, l.type, l.site_id, s.name AS site
       FROM locations l
       JOIN sites s ON l.site_id = s.id
       ORDER BY s.name, l.name`
    );
    res.json(rows);
  }
);

router.post(
  '/locations',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { name, type, site_id } = req.body;

    if (!name || !site_id) {
      return res.status(400).json({
        error: 'Location name and site are required'
      });
    }

    await db.query(
      `INSERT INTO locations (name, type, site_id)
       VALUES (?, ?, ?)`,
      [name.trim(), type || null, site_id]
    );

    res.json({ success: true });
  }
);



/* ======================================================
   UPDATE LOCATION
   ====================================================== */
router.put(
  '/locations/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const locationId = req.params.id;
    const { name, type, site_id } = req.body;

    if (!name || !site_id) {
      return res.status(400).json({
        error: 'Location name and site are required'
      });
    }

    await db.query(
      `UPDATE locations
       SET name = ?, type = ?, site_id = ?
       WHERE id = ?`,
      [
        name.trim(),
        type || null,
        site_id,
        locationId
      ]
    );

    res.json({ success: true });
  }
);


/* ❌ DELETE LOCATION – BLOCK IF ACTIVE POs EXIST */
router.delete(
  '/locations/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const locationId = req.params.id;

    const [rows] = await db.query(
      `SELECT COUNT(*) AS count
       FROM purchase_orders
       WHERE location_id = ?`,
      [locationId]
    );

    if (rows[0].count > 0) {
      return res.status(400).json({
        error: 'This location cannot be deleted because it has active Purchase Orders'
      });
    }

    await db.query(
      `DELETE FROM locations WHERE id = ?`,
      [locationId]
    );

    res.json({ success: true });
  }
);

/* ======================================================
   MERGE LOCATIONS – SUPER ADMIN ONLY
   ====================================================== */
router.post(
  '/merge-locations',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { keep_location_id, merge_location_id } = req.body;
    let connection;

    try {
      if (!keep_location_id || !merge_location_id) {
        return res.status(400).json({
          error: 'Both keep_location_id and merge_location_id are required'
        });
      }

      if (keep_location_id === merge_location_id) {
        return res.status(400).json({
          error: 'Cannot merge a location into itself'
        });
      }

      connection = await db.getConnection();

      // ✅ Verify both locations exist
      const [keepLoc] = await connection.query(
        'SELECT id, name, site_id FROM locations WHERE id = ?',
        [keep_location_id]
      );

      const [mergeLoc] = await connection.query(
        'SELECT id, name, site_id FROM locations WHERE id = ?',
        [merge_location_id]
      );

      if (keepLoc.length === 0 || mergeLoc.length === 0) {
        connection.release();
        return res.status(404).json({
          error: 'One or both locations not found'
        });
      }

      // 🔄 Start transaction
      await connection.beginTransaction();

      try {
        // Step 1: Update all Purchase Orders pointing to merge_location to keep_location
        console.log(`📝 Updating Purchase Orders from location ${merge_location_id} to ${keep_location_id}`);
        await connection.query(
          'UPDATE purchase_orders SET location_id = ? WHERE location_id = ?',
          [keep_location_id, merge_location_id]
        );

        // Step 2: Delete location_spread_rule_locations entries for merged location
        // (rather than updating, since updating would create duplicates)
        console.log(`🗑️  Deleting location spread rule location entries for ${merge_location_id}`);
        await connection.query(
          'DELETE FROM location_spread_rule_locations WHERE location_id = ?',
          [merge_location_id]
        );

        // Step 3: Handle location_spread_rules that reference merge_location as source
        // These rules become invalid, so we delete them
        console.log(`🗑️  Deleting spread rules that source from location ${merge_location_id}`);
        const [rulesToDelete] = await connection.query(
          'SELECT id FROM location_spread_rules WHERE source_location_id = ?',
          [merge_location_id]
        );

        for (const rule of rulesToDelete) {
          await connection.query(
            'DELETE FROM location_spread_rule_sites WHERE rule_id = ?',
            [rule.id]
          );
          await connection.query(
            'DELETE FROM location_spread_rules WHERE id = ?',
            [rule.id]
          );
        }

        // Step 4: Delete the merged location
        console.log(`❌ Deleting location ${merge_location_id}`);
        await connection.query(
          'DELETE FROM locations WHERE id = ?',
          [merge_location_id]
        );

        // ✅ Commit transaction
        await connection.commit();

        console.log(`✅ Successfully merged location ${merge_location_id} into ${keep_location_id}`);

        res.json({
          success: true,
          message: `Successfully merged "${mergeLoc[0].name}" into "${keepLoc[0].name}"`,
          merged_into: {
            id: keep_location_id,
            name: keepLoc[0].name
          },
          deleted: {
            id: merge_location_id,
            name: mergeLoc[0].name
          }
        });

      } catch (transactionErr) {
        await connection.rollback();
        throw transactionErr;
      }

    } catch (err) {
      console.error('MERGE LOCATIONS ERROR:', err);
      res.status(500).json({
        error: 'Failed to merge locations',
        details: err.message
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

/* ======================================================
   AUTO-POPULATE SITES & LOCATIONS FROM PO DATA
   ====================================================== */
router.post(
  '/auto-populate-sites',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      console.log('🔄 Starting auto-population of sites and locations...');

      // Step 1: Get unique site letters from PO numbers and their existing site_id
      const [poSiteData] = await db.query(`
        SELECT DISTINCT
          SUBSTRING(po_number, 1, 1) as site_letter,
          site_id,
          COUNT(*) as po_count
        FROM purchase_orders
        GROUP BY site_letter, site_id
        ORDER BY site_letter
      `);

      console.log('Found PO site data:', poSiteData);

      // Step 2: Get site letter mappings from database
      const [siteLetterMappings] = await db.query(`
        SELECT sl.letter, s.id, s.name
        FROM site_letters sl
        JOIN sites s ON sl.site_id = s.id
      `);
      
      const siteLetterMap = {};
      siteLetterMappings.forEach(mapping => {
        siteLetterMap[mapping.letter] = mapping;
      });

      console.log('Site letter mappings:', siteLetterMap);

      // Step 3: Get existing sites
      const [existingSites] = await db.query('SELECT id, name FROM sites');
      const siteMap = {};
      existingSites.forEach(s => {
        siteMap[s.id] = s.name;
      });

      const updates = [];
      const siteIdToLetter = {};

      for (const data of poSiteData) {
        const mapping = siteLetterMap[data.site_letter];
        
        // Only process if we have a mapping for this letter
        if (mapping && data.site_id && siteMap[data.site_id]) {
          // Update the name if it doesn't match
          if (siteMap[data.site_id] !== mapping.name) {
            await db.query(
              'UPDATE sites SET name = ? WHERE id = ?',
              [mapping.name, data.site_id]
            );
            updates.push({
              action: 'updated',
              site_id: data.site_id,
              old_name: siteMap[data.site_id],
              new_name: mapping.name,
              letter: data.site_letter
            });
          }
          siteIdToLetter[data.site_id] = data.site_letter;
        } else if (!mapping) {
          console.warn(`⚠️  No mapping found for PO letter: ${data.site_letter}`);
        }
      }

      // Step 4: Update location associations based on PO site_id
      // Find all locations that need to be associated with the correct site
      const [locationUpdates] = await db.query(`
        SELECT DISTINCT
          l.id as location_id,
          l.name as location_name,
          l.site_id as current_site_id,
          po.site_id as po_site_id,
          COUNT(*) as po_count
        FROM locations l
        JOIN purchase_orders po ON po.location_id = l.id
        WHERE l.site_id != po.site_id OR l.site_id IS NULL
        GROUP BY l.id, l.name, l.site_id, po.site_id
        ORDER BY po_count DESC
      `);

      const locationUpdateResults = [];
      for (const loc of locationUpdates) {
        await db.query(
          'UPDATE locations SET site_id = ? WHERE id = ?',
          [loc.po_site_id, loc.location_id]
        );
        locationUpdateResults.push({
          location_id: loc.location_id,
          location_name: loc.location_name,
          old_site_id: loc.current_site_id,
          new_site_id: loc.po_site_id,
          po_count: loc.po_count
        });
      }

      // Step 5: Get summary
      const [siteSummary] = await db.query(`
        SELECT 
          s.id,
          s.name,
          COUNT(DISTINCT l.id) as location_count,
          COUNT(DISTINCT po.id) as po_count
        FROM sites s
        LEFT JOIN locations l ON l.site_id = s.id
        LEFT JOIN purchase_orders po ON po.site_id = s.id
        GROUP BY s.id, s.name
        ORDER BY s.name
      `);

      res.json({
        success: true,
        message: 'Sites and locations auto-populated successfully',
        site_updates: updates,
        location_updates: locationUpdateResults.length,
        location_details: locationUpdateResults,
        summary: siteSummary
      });

    } catch (err) {
      console.error('AUTO-POPULATE ERROR:', err);
      res.status(500).json({
        error: 'Failed to auto-populate sites and locations',
        details: err.message
      });
    }
  }
);

/* ======================================================
   GET SITE LETTER MAPPINGS
   ====================================================== */
router.get(
  '/site-letters',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const [mappings] = await db.query(`
        SELECT sl.id, sl.letter, sl.site_id, s.name as site_name
        FROM site_letters sl
        JOIN sites s ON sl.site_id = s.id
        ORDER BY sl.letter
      `);
      res.json(mappings);
    } catch (err) {
      console.error('Error fetching site letters:', err);
      res.status(500).json({ error: 'Failed to fetch site letter mappings' });
    }
  }
);

/* ======================================================
   CREATE SITE LETTER MAPPING
   ====================================================== */
router.post(
  '/site-letters',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { letter, site_id } = req.body;

    if (!letter || letter.length !== 1 || !site_id) {
      return res.status(400).json({
        error: 'Letter (single character) and site_id are required'
      });
    }

    try {
      await db.query(
        'INSERT INTO site_letters (letter, site_id) VALUES (?, ?)',
        [letter.toUpperCase(), site_id]
      );
      res.json({ success: true, message: `Letter ${letter.toUpperCase()} mapped to site ${site_id}` });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: `Letter ${letter.toUpperCase()} is already mapped to another site`
        });
      }
      console.error('Error creating site letter mapping:', err);
      res.status(500).json({ error: 'Failed to create site letter mapping' });
    }
  }
);

/* ======================================================
   UPDATE SITE LETTER MAPPING
   ====================================================== */
router.put(
  '/site-letters/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const mappingId = req.params.id;
    const { letter, site_id } = req.body;

    if (!letter || letter.length !== 1 || !site_id) {
      return res.status(400).json({
        error: 'Letter (single character) and site_id are required'
      });
    }

    try {
      const [result] = await db.query(
        'UPDATE site_letters SET letter = ?, site_id = ? WHERE id = ?',
        [letter.toUpperCase(), site_id, mappingId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Site letter mapping not found' });
      }

      res.json({ success: true, message: 'Site letter mapping updated' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: `Letter ${letter.toUpperCase()} is already mapped to another site`
        });
      }
      console.error('Error updating site letter mapping:', err);
      res.status(500).json({ error: 'Failed to update site letter mapping' });
    }
  }
);

/* ======================================================
   DELETE SITE LETTER MAPPING
   ====================================================== */
router.delete(
  '/site-letters/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const mappingId = req.params.id;

    try {
      const [result] = await db.query(
        'DELETE FROM site_letters WHERE id = ?',
        [mappingId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Site letter mapping not found' });
      }

      res.json({ success: true, message: 'Site letter mapping deleted' });
    } catch (err) {
      console.error('Error deleting site letter mapping:', err);
      res.status(500).json({ error: 'Failed to delete site letter mapping' });
    }
  }
);

module.exports = router;
