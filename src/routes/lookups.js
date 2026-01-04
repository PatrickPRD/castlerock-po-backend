const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, authorizeRoles } = require('../middleware/auth');

/* ============================
   GET /suppliers
   ============================ */
router.get(
  '/suppliers',
  authenticate,
  authorizeRoles('super_admin','admin', 'staff', 'viewer'),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name FROM suppliers ORDER BY name'
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load suppliers' });
    }
  }
);

/* ============================
   GET /sites
   ============================ */
router.get(
  '/sites',
  authenticate,
  authorizeRoles('super_admin','admin', 'staff', 'viewer'),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name FROM sites ORDER BY name'
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load sites' });
    }
  }
);

/* ============================
   GET /locations?siteId=#
   ============================ */
router.get(
  '/locations',
  authenticate,
  authorizeRoles('super_admin','super_admin','admin', 'staff', 'viewer'),
  async (req, res) => {
    const { siteId } = req.query;

    if (!siteId) {
      return res.status(400).json({ error: 'siteId required' });
    }

    try {
      const [rows] = await pool.query(
        `
        SELECT id, name
        FROM locations
        WHERE site_id = ?
        ORDER BY name
        `,
        [siteId]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load locations' });
    }
  }
);

/* ============================
   GET /stages?siteId=#
   ============================ */
router.get(
  '/stages',
  authenticate,
  async (req, res) => {
    const [rows] = await db.query(
      'SELECT id, name FROM po_stages ORDER BY sort_order'
    );
    res.json(rows);
  }
);




module.exports = router;
