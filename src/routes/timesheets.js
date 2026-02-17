const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');
const SettingsService = require('../services/settingsService');
const logAudit = require('../services/auditService');

const LEAVE_TYPES = new Set([
  'paid_sick',
  'sick',
  'annual_leave',
  'unpaid_leave',
  'bank_holiday',
  'absent'
]);

function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function normalizeLeaveYearStart(value) {
  const match = String(value || '').trim().match(/^(\d{2})-(\d{2})$/);
  if (!match) return '01-01';
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12) return '01-01';
  const test = new Date(2000, month - 1, day);
  if (test.getMonth() + 1 !== month || test.getDate() !== day) return '01-01';
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLeaveYearBounds(weekStart, leaveYearStart) {
  const [monthStr, dayStr] = leaveYearStart.split('-');
  const startMonth = Number(monthStr);
  const startDay = Number(dayStr);
  const weekDate = new Date(`${weekStart}T00:00:00`);
  let startYear = weekDate.getFullYear();
  let startDate = new Date(startYear, startMonth - 1, startDay);

  if (weekDate < startDate) {
    startYear -= 1;
    startDate = new Date(startYear, startMonth - 1, startDay);
  }

  const endDate = new Date(startDate.getFullYear() + 1, startMonth - 1, startDay);
  return { startDate, endDate };
}

router.get(
  '/weeks',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    const workerSearch = String(req.query.workerSearch || '').trim();
    const hasSearch = workerSearch.length > 0;
    const searchParam = `%${workerSearch}%`;

    try {
      const [rows] = await db.query(
        `
        SELECT DISTINCT t.week_start
        FROM timesheets t
        JOIN timesheet_entries te ON te.timesheet_id = t.id
        JOIN workers w ON w.id = te.worker_id
        WHERE ? = ''
           OR CONCAT(COALESCE(w.first_name, ''), ' ', COALESCE(w.last_name, '')) LIKE ?
        ORDER BY t.week_start DESC
        `,
        [hasSearch ? workerSearch : '', searchParam]
      );

      const weeks = rows.map(row => {
        if (!row.week_start) return null;
        if (row.week_start instanceof Date) {
          return row.week_start.toISOString().slice(0, 10);
        }
        return String(row.week_start).slice(0, 10);
      }).filter(Boolean);

      res.json({ weeks });
    } catch (err) {
      console.error('LOAD TIMESHEET WEEKS ERROR:', err);
      res.status(500).json({ error: 'Failed to load timesheet weeks' });
    }
  }
);

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

      const settings = await SettingsService.getSettings();
      const leaveYearStart = normalizeLeaveYearStart(settings.leave_year_start || '01-01');
      const { startDate, endDate } = getLeaveYearBounds(weekStart, leaveYearStart);

      const [entries] = await db.query(
        `
        SELECT
          te.worker_id,
          DATE_FORMAT(te.work_date, '%Y-%m-%d') AS work_date,
          te.site_id,
          te.location_id,
          te.stage_id,
          te.leave_type,
          w.first_name,
          w.last_name,
          w.date_of_employment,
          w.left_at
        FROM timesheet_entries te
        JOIN timesheets t ON t.id = te.timesheet_id
        JOIN workers w ON w.id = te.worker_id
        WHERE t.week_start = ?
        `,
        [weekStart]
      );

      const invalidEntries = [];
      const visibleEntries = entries.filter(entry => {
        const workDate = new Date(`${entry.work_date}T00:00:00`);
        const startDate = entry.date_of_employment
          ? new Date(entry.date_of_employment)
          : null;
        const endDate = entry.left_at
          ? new Date(entry.left_at)
          : null;

        if (startDate && workDate < startDate) {
          invalidEntries.push(entry);
          return false;
        }

        if (endDate && workDate > endDate) {
          invalidEntries.push(entry);
          return false;
        }

        return true;
      });

      const warnings = [];
      if (invalidEntries.length) {
        warnings.push(
          `${invalidEntries.length} timesheet entr${invalidEntries.length === 1 ? 'y was' : 'ies were'} hidden because they fall outside employment dates.`
        );

        invalidEntries.slice(0, 10).forEach(entry => {
          const name = `${entry.first_name || ''} ${entry.last_name || ''}`.trim() || 'Unnamed worker';
          warnings.push(`${name} on ${entry.work_date}`);
        });

        if (invalidEntries.length > 10) {
          warnings.push(`And ${invalidEntries.length - 10} more...`);
        }
      }

      const [workers] = await db.query(
        `
        SELECT w.id, w.first_name, w.last_name, w.active
        FROM workers w
        WHERE (w.date_of_employment IS NULL OR w.date_of_employment <= DATE_ADD(?, INTERVAL 6 DAY))
          AND (w.left_at IS NULL OR w.left_at >= ?)
        ORDER BY w.last_name, w.first_name
        `,
        [weekStart, weekStart]
      );

      const [leaveRows] = await db.query(
        `
        SELECT worker_id, leave_type, COUNT(*) AS days_used
        FROM timesheet_entries
        WHERE leave_type IS NOT NULL
          AND work_date >= ?
          AND work_date < ?
        GROUP BY worker_id, leave_type
        `,
        [formatDate(startDate), formatDate(endDate)]
      );

      const leaveUsage = {};
      (leaveRows || []).forEach(row => {
        const workerId = String(row.worker_id);
        if (!leaveUsage[workerId]) {
          leaveUsage[workerId] = {
            paid_sick: 0,
            sick: 0,
            annual_leave: 0,
            unpaid_leave: 0,
            bank_holiday: 0,
            absent: 0
          };
        }
        const type = String(row.leave_type || '').trim();
        if (leaveUsage[workerId][type] !== undefined) {
          leaveUsage[workerId][type] = Number(row.days_used || 0);
        }
      });

      res.json({
        week_start: timesheet ? timesheet.week_start : weekStart,
        workers,
        entries: visibleEntries.map(entry => ({
          worker_id: entry.worker_id,
          work_date: entry.work_date,
          site_id: entry.site_id,
          location_id: entry.location_id,
          stage_id: entry.stage_id,
          leave_type: entry.leave_type || null
        })),
        warnings,
        leave_settings: {
          sick_days_per_year: Number(settings.sick_days_per_year || 0),
          annual_leave_days_per_year: Number(settings.annual_leave_days_per_year || 0),
          bank_holidays_per_year: Number(settings.bank_holidays_per_year || 0),
          leave_year_start: leaveYearStart
        },
        leave_usage: leaveUsage
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
    for (const entry of normalizedEntries) {
      if (entry.leave_type && !LEAVE_TYPES.has(entry.leave_type)) {
        return res.status(400).json({
          error: `Invalid leave_type: ${entry.leave_type}`
        });
      }
    }

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
            entry.location_id,
            entry.stage_id || null,
            entry.leave_type || null
          );
          return '(?, ?, ?, ?, ?, ?, ?)';
        });

        await conn.query(
          `
          INSERT INTO timesheet_entries
            (timesheet_id, worker_id, work_date, site_id, location_id, stage_id, leave_type)
          VALUES ${placeholders.join(', ')}
          `,
          values
        );
      }

      await conn.commit();

      logAudit({
        table_name: 'timesheets',
        record_id: timesheetId,
        action: normalizedEntries.length > 0 ? 'UPDATE' : 'CREATE',
        old_data: null,
        new_data: { week_start, entries_count: normalizedEntries.length },
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Timesheet save audit log failed:', err));

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
