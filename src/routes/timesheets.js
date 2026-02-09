const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');

function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    const weekStart = String(req.query.week_start || '').trim();

    if (!isDateString(weekStart)) {
      return res.status(400).json({ error: 'week_start is required (YYYY-MM-DD)' });
    }

    try {
      const [[timesheet]] = await db.query(
        'SELECT id, week_start FROM timesheets WHERE week_start = ? LIMIT 1',
        [weekStart]
      );

      const [entries] = await db.query(
        `
        SELECT
          te.worker_id,
          DATE_FORMAT(te.work_date, '%Y-%m-%d') AS work_date,
          te.site_id,
          te.location_id
        FROM timesheet_entries te
        JOIN timesheets t ON t.id = te.timesheet_id
        WHERE t.week_start = ?
        `,
        [weekStart]
      );

      const [workers] = await db.query(
        `
        SELECT w.id, w.first_name, w.last_name, w.active
        FROM workers w
        WHERE w.active = 1
           OR w.id IN (
            SELECT DISTINCT te.worker_id
            FROM timesheet_entries te
            JOIN timesheets t ON t.id = te.timesheet_id
            WHERE t.week_start = ?
           )
        ORDER BY w.last_name, w.first_name
        `,
        [weekStart]
      );

      res.json({
        week_start: timesheet ? timesheet.week_start : weekStart,
        workers,
        entries
      });
    } catch (err) {
      console.error('LOAD TIMESHEETS ERROR:', err);
      res.status(500).json({ error: 'Failed to load timesheets' });
    }
  }
);

router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    const { week_start, entries } = req.body || {};

    if (!isDateString(week_start)) {
      return res.status(400).json({ error: 'week_start is required (YYYY-MM-DD)' });
    }

    const normalizedEntries = Array.isArray(entries) ? entries : [];

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [timesheetResult] = await conn.query(
        `
        INSERT INTO timesheets (week_start)
        VALUES (?)
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
        `,
        [week_start]
      );
      const timesheetId = timesheetResult.insertId;

      await conn.query(
        'DELETE FROM timesheet_entries WHERE timesheet_id = ?',
        [timesheetId]
      );

      if (normalizedEntries.length > 0) {
        const values = [];
        const placeholders = normalizedEntries.map(entry => {
          values.push(
            timesheetId,
            entry.worker_id,
            entry.work_date,
            entry.site_id,
            entry.location_id
          );
          return '(?, ?, ?, ?, ?)';
        });

        await conn.query(
          `
          INSERT INTO timesheet_entries
            (timesheet_id, worker_id, work_date, site_id, location_id)
          VALUES ${placeholders.join(', ')}
          `,
          values
        );
      }

      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      await conn.rollback();
      console.error('SAVE TIMESHEETS ERROR:', err);
      res.status(500).json({ error: 'Failed to save timesheets' });
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
