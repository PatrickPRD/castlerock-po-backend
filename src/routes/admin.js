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
      `SELECT id, name, address, active
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
    const { name, site_code } = req.body;

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
        `INSERT INTO sites (name, site_letter)
         VALUES (?, ?)`,
        [name.trim(), site_code.toUpperCase()]
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
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Site name is required' });
    }

    await db.query(
      `UPDATE sites
       SET name = ?
       WHERE id = ?`,
      [name.trim(), siteId]
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
   LOCATIONS – SUPER ADMIN
   ====================================================== */

router.get(
  '/locations',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const [rows] = await db.query(
      `SELECT l.id, l.name, l.site_id, s.name AS site
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
  authorizeRoles('admin', 'super_admin'),
  async (req, res) => {
    const { name, site_id, type } = req.body;

    if (!name || !site_id || !type) {
      return res.status(400).json({
        error: 'Location name, site and type are required'
      });
    }

    await db.query(
      `INSERT INTO locations (name, site_id, type)
       VALUES (?, ?, ?)`,
      [name.trim(), site_id, type.trim()]
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

      // Step 2: Get existing sites
      const [existingSites] = await db.query('SELECT id, name FROM sites');
      const siteMap = {};
      existingSites.forEach(s => {
        siteMap[s.id] = s.name;
      });

      // Step 3: Update site names based on PO letter mapping
      const siteLetterMap = {
        'B': 'Bandon',
        'M': 'Midleton', 
        'P': 'Phase 2',
        'T': 'Test Site'
      };

      const updates = [];
      const siteIdToLetter = {};

      for (const data of poSiteData) {
        const siteName = siteLetterMap[data.site_letter] || `Site ${data.site_letter}`;
        
        // Check if this site_id exists
        if (data.site_id && siteMap[data.site_id]) {
          // Update the name if it doesn't match
          if (siteMap[data.site_id] !== siteName) {
            await db.query(
              'UPDATE sites SET name = ? WHERE id = ?',
              [siteName, data.site_id]
            );
            updates.push({
              action: 'updated',
              site_id: data.site_id,
              old_name: siteMap[data.site_id],
              new_name: siteName,
              letter: data.site_letter
            });
          }
          siteIdToLetter[data.site_id] = data.site_letter;
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

module.exports = router;
