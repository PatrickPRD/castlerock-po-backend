const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

/* ======================================================
   GET /location-spread-rules
   ====================================================== */
router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const [rules] = await db.query(`
        SELECT
          r.id,
          r.name,
          r.source_location_id,
          l.name AS source_location_name,
          s.id AS source_site_id,
          s.name AS source_site_name
        FROM location_spread_rules r
        JOIN locations l ON l.id = r.source_location_id
        JOIN sites s ON s.id = l.site_id
        ORDER BY s.name, l.name
      `);

      if (rules.length === 0) {
        return res.json([]);
      }

      const ruleIds = rules.map(r => r.id);

      const [ruleSites] = await db.query(`
        SELECT
          rs.id,
          rs.rule_id,
          rs.site_id,
          rs.spread_all,
          s.name AS site_name
        FROM location_spread_rule_sites rs
        JOIN sites s ON s.id = rs.site_id
        WHERE rs.rule_id IN (?)
        ORDER BY s.name
      `, [ruleIds]);

      const ruleSiteIds = ruleSites.map(rs => rs.id);
      let ruleSiteLocations = [];

      if (ruleSiteIds.length > 0) {
        [ruleSiteLocations] = await db.query(`
          SELECT
            rsl.rule_site_id,
            rsl.location_id,
            l.name AS location_name
          FROM location_spread_rule_locations rsl
          JOIN locations l ON l.id = rsl.location_id
          WHERE rsl.rule_site_id IN (?)
          ORDER BY l.name
        `, [ruleSiteIds]);
      }

      const ruleSiteMap = {};
      ruleSites.forEach(rs => {
        ruleSiteMap[rs.id] = {
          id: rs.id,
          ruleId: rs.rule_id,
          siteId: rs.site_id,
          siteName: rs.site_name,
          spreadAll: Number(rs.spread_all) === 1,
          locations: []
        };
      });

      ruleSiteLocations.forEach(loc => {
        if (!ruleSiteMap[loc.rule_site_id]) return;
        ruleSiteMap[loc.rule_site_id].locations.push({
          id: loc.location_id,
          name: loc.location_name
        });
      });

      const rulesMap = {};
      rules.forEach(r => {
        rulesMap[r.id] = {
          id: r.id,
          name: r.name,
          sourceLocationId: r.source_location_id,
          sourceLocationName: r.source_location_name,
          sourceSiteId: r.source_site_id,
          sourceSiteName: r.source_site_name,
          sites: []
        };
      });

      Object.values(ruleSiteMap).forEach(site => {
        if (!rulesMap[site.ruleId]) return;
        rulesMap[site.ruleId].sites.push(site);
      });

      res.json(Object.values(rulesMap));

    } catch (err) {
      console.error('LOAD LOCATION SPREAD RULES ERROR:', err);
      res.status(500).json({ error: 'Failed to load location spread rules' });
    }
  }
);

/* ======================================================
   POST /location-spread-rules
   ====================================================== */
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { name, sourceLocationId, sites } = req.body;

    if (!sourceLocationId || !Array.isArray(sites) || sites.length === 0) {
      return res.status(400).json({ error: 'Source location and sites are required' });
    }

    try {
      const [[existing]] = await db.query(
        'SELECT id FROM location_spread_rules WHERE source_location_id = ? LIMIT 1',
        [sourceLocationId]
      );

      if (existing) {
        return res.status(400).json({ error: 'A rule already exists for this source location' });
      }

      const conn = await db.getConnection();
      await conn.beginTransaction();

      const ruleName = name && name.trim() ? name.trim() : 'Spread Rule';

      const [result] = await conn.query(
        `INSERT INTO location_spread_rules (name, source_location_id, created_by)
         VALUES (?, ?, ?)`,
        [ruleName, sourceLocationId, req.user.id]
      );

      const ruleId = result.insertId;

      for (const site of sites) {
        const [siteRes] = await conn.query(
          `INSERT INTO location_spread_rule_sites (rule_id, site_id, spread_all)
           VALUES (?, ?, ?)`,
          [ruleId, site.siteId, site.spreadAll ? 1 : 0]
        );

        const ruleSiteId = siteRes.insertId;

        if (!site.spreadAll && Array.isArray(site.locationIds)) {
          for (const locId of site.locationIds) {
            await conn.query(
              `INSERT INTO location_spread_rule_locations (rule_site_id, location_id)
               VALUES (?, ?)`,
              [ruleSiteId, locId]
            );
          }
        }
      }

      await conn.commit();
      conn.release();

      res.json({ success: true, id: ruleId });

    } catch (err) {
      console.error('CREATE LOCATION SPREAD RULE ERROR:', err);
      res.status(500).json({ error: 'Failed to create location spread rule' });
    }
  }
);

/* ======================================================
   PUT /location-spread-rules/:id
   ====================================================== */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const ruleId = Number(req.params.id);
    const { name, sourceLocationId, sites } = req.body;

    if (!ruleId || !sourceLocationId || !Array.isArray(sites) || sites.length === 0) {
      return res.status(400).json({ error: 'Source location and sites are required' });
    }

    try {
      const conn = await db.getConnection();
      await conn.beginTransaction();

      const ruleName = name && name.trim() ? name.trim() : 'Spread Rule';

      await conn.query(
        `UPDATE location_spread_rules
         SET name = ?, source_location_id = ?
         WHERE id = ?`,
        [ruleName, sourceLocationId, ruleId]
      );

      await conn.query(
        `DELETE rsl FROM location_spread_rule_locations rsl
         JOIN location_spread_rule_sites rs ON rs.id = rsl.rule_site_id
         WHERE rs.rule_id = ?`,
        [ruleId]
      );

      await conn.query(
        `DELETE FROM location_spread_rule_sites WHERE rule_id = ?`,
        [ruleId]
      );

      for (const site of sites) {
        const [siteRes] = await conn.query(
          `INSERT INTO location_spread_rule_sites (rule_id, site_id, spread_all)
           VALUES (?, ?, ?)`,
          [ruleId, site.siteId, site.spreadAll ? 1 : 0]
        );

        const ruleSiteId = siteRes.insertId;

        if (!site.spreadAll && Array.isArray(site.locationIds)) {
          for (const locId of site.locationIds) {
            await conn.query(
              `INSERT INTO location_spread_rule_locations (rule_site_id, location_id)
               VALUES (?, ?)`,
              [ruleSiteId, locId]
            );
          }
        }
      }

      await conn.commit();
      conn.release();

      res.json({ success: true });

    } catch (err) {
      console.error('UPDATE LOCATION SPREAD RULE ERROR:', err);
      res.status(500).json({ error: 'Failed to update location spread rule' });
    }
  }
);

/* ======================================================
   DELETE /location-spread-rules/:id
   ====================================================== */
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const ruleId = Number(req.params.id);

    try {
      await db.query(`DELETE FROM location_spread_rules WHERE id = ?`, [ruleId]);
      res.json({ success: true });
    } catch (err) {
      console.error('DELETE LOCATION SPREAD RULE ERROR:', err);
      res.status(500).json({ error: 'Failed to delete location spread rule' });
    }
  }
);

module.exports = router;
