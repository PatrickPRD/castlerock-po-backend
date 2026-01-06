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

    const [rows] = await db.query(`
      SELECT
        id,
        email,
        role,
        active,
        first_name,
        last_name,
        created_at
      FROM users
      ORDER BY last_name, first_name
    `);

    res.json(rows);
  }
);

router.get(
  '/users/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {

    const [[user]] = await db.query(
      `
      SELECT
        id,
        email,
        role,
        active,
        first_name,
        last_name
      FROM users
      WHERE id = ?
      `,
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  }
);

router.post(
  '/users',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { email, role, first_name, last_name } = req.body;

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
const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

await db.query(
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

// 📧 Send password setup email
await sendPasswordSetupEmail(email, resetToken);


    res.json({ success: true });
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
   SITES – SUPER ADMIN ONLY
   ====================================================== */

router.get(
  '/sites',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const [rows] = await db.query(
      `SELECT id, name, site_letter
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
   LOCATIONS – ADMIN + SUPER ADMIN
   ====================================================== */

router.get(
  '/locations',
  authenticate,
  authorizeRoles('admin', 'super_admin'),
  async (req, res) => {
    const [rows] = await db.query(
      `SELECT l.id, l.name, l.type, s.name AS site
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
  authorizeRoles('admin', 'super_admin'),
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
  authorizeRoles('admin', 'super_admin'),
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

module.exports = router;
