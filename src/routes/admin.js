const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');
const logAudit = require('../services/auditService');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { sendPasswordSetupEmail } =
  require('../services/userEmailService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ukMatch = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toUkDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${day}-${month}-${year}`;
  }

  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}-${month}-${year}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}-${month}-${year}`;
}





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

router.get(
  '/users/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const [[user]] = await db.query(`
        SELECT
          id,
          email,
          first_name,
          last_name,
          role,
          active
        FROM users
        WHERE id = ?
      `, [userId]);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);

    } catch (err) {
      console.error('LOAD USER ERROR:', err);
      res.status(500).json({
        error: 'Failed to load user'
      });
    }
  }
);


router.post(
  '/users',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { email, role, first_name, last_name, password } = req.body;

    try {
      // Validate password is provided
      if (!password) {
        return res.status(400).json({
          error: 'Password is required'
        });
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const [result] = await db.query(
        `INSERT INTO users
         (email, role, first_name, last_name, password_hash, active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [
          email,
          role,
          first_name,
          last_name,
          passwordHash
        ]
      );

      // Audit log (non-blocking)
      logAudit({
        table_name: 'users',
        record_id: result.insertId,
        action: 'CREATE',
        old_data: null,
        new_data: { email, role, first_name, last_name },
        changed_by: req.user.id,
        req
      }).catch(err => {
        console.error('User create audit log failed:', err);
      });

      // Respond
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

    const { email, role, first_name, last_name, active, password } = req.body;
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
    if (userId === actingUserId && active === 0) {
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
    
    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    await db.query(
      `
      UPDATE users
SET
  email         = COALESCE(?, email),
  role          = COALESCE(?, role),
  first_name    = COALESCE(?, first_name),
  last_name     = COALESCE(?, last_name),
  active        = COALESCE(?, active),
  password_hash = COALESCE(?, password_hash)
WHERE id = ?

      `,
      [
  email,
  role,
  first_name,
  last_name,
  active,
  passwordHash,
  userId
]

    );

    // Audit log (non-blocking)
    logAudit({
      table_name: 'users',
      record_id: userId,
      action: 'UPDATE',
      old_data: { 
        email: target.email, 
        role: target.role, 
        first_name: target.first_name, 
        last_name: target.last_name,
        active: target.active 
      },
      new_data: { email, role, first_name, last_name, active },
      changed_by: req.user.id,
      req
    }).catch(err => {
      console.error('User update audit log failed:', err);
    });

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

      // Audit log (non-blocking)
      logAudit({
        table_name: 'users',
        record_id: userId,
        action: 'DELETE',
        old_data: users[0],
        new_data: null,
        changed_by: req.user.id,
        req
      }).catch(err => {
        console.error('User delete audit log failed:', err);
      });

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
      const [result] = await db.query(
        `INSERT INTO sites (name, site_letter, address)
         VALUES (?, ?, ?)`,
        [name.trim(), site_code.toUpperCase(), address || null]
      );

      const siteId = result.insertId;
      if (siteId) {
        await db.query(
          `INSERT INTO locations (name, type, site_id, active)
           VALUES ('Site', 'system', ?, 1)`,
          [siteId]
        );
      }

      logAudit({
        table_name: 'sites',
        record_id: siteId,
        action: 'CREATE',
        old_data: null,
        new_data: { name: name.trim(), site_letter: site_code.toUpperCase(), address },
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Site create audit log failed:', err));

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

    const [[oldSite]] = await db.query(
      'SELECT * FROM sites WHERE id = ?',
      [siteId]
    );

    await db.query(
      `UPDATE sites
       SET name = ?, address = ?
       WHERE id = ?`,
      [name.trim(), address || null, siteId]
    );

    if (oldSite) {
      logAudit({
        table_name: 'sites',
        record_id: siteId,
        action: 'UPDATE',
        old_data: { name: oldSite.name, address: oldSite.address },
        new_data: { name: name.trim(), address },
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Site update audit log failed:', err));
    }

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

    const [[site]] = await db.query(
      'SELECT * FROM sites WHERE id = ?',
      [siteId]
    );

    await db.query(
      `DELETE FROM sites WHERE id = ?`,
      [siteId]
    );

    if (site) {
      logAudit({
        table_name: 'sites',
        record_id: siteId,
        action: 'DELETE',
        old_data: site,
        new_data: null,
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Site delete audit log failed:', err));
    }

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

    const [result] = await db.query(
      `INSERT INTO po_stages (name, active)
       VALUES (?, ?)`,
      [name.trim(), active ? 1 : 0]
    );

    await logAudit({
      table_name: 'po_stages',
      record_id: result.insertId,
      action: 'CREATE',
      old_data: null,
      new_data: { name: name.trim(), active: active ? 1 : 0 },
      changed_by: req.user.id,
      req
    });

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

    const [[oldStage]] = await db.query(
      'SELECT * FROM po_stages WHERE id = ?',
      [stageId]
    );

    if (!oldStage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    await db.query(
      `UPDATE po_stages
       SET name = ?, active = ?
       WHERE id = ?`,
      [name.trim(), active ? 1 : 0, stageId]
    );

    await logAudit({
      table_name: 'po_stages',
      record_id: stageId,
      action: 'UPDATE',
      old_data: oldStage,
      new_data: { name: name.trim(), active: active ? 1 : 0 },
      changed_by: req.user.id,
      req
    });

    res.json({ success: true });
  }
);

router.delete(
  '/stages/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const stageId = req.params.id;

    const [[stage]] = await db.query(
      'SELECT * FROM po_stages WHERE id = ?',
      [stageId]
    );

    if (!stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }

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

    await logAudit({
      table_name: 'po_stages',
      record_id: stageId,
      action: 'DELETE',
      old_data: stage,
      new_data: null,
      changed_by: req.user.id,
      req
    });

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
    const whereClause = includeInactive ? '' : 'WHERE left_at IS NULL OR left_at >= CURDATE()';

    try {
      const [rows] = await db.query(
        `SELECT
           id,
           first_name,
           last_name,
          nickname,
           email,
           mobile_number,
           address,
           bank_details,
           pps_number,
           weekly_take_home,
           weekly_cost,
           safe_pass_number,
           safe_pass_expiry_date,
           date_of_employment,
           employee_id,
           login_no,
           notes,
           left_at,
           CASE
             WHEN left_at IS NULL OR left_at >= CURDATE() THEN 1
             ELSE 0
           END AS active
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
      nickname,
      email,
      mobile_number,
      address,
      bank_details,
      pps_number,
      weekly_take_home,
      weekly_cost,
      safe_pass_number,
      safe_pass_expiry_date,
      date_of_employment,
      left_at,
      employee_id,
      login_no,
      notes
    } = req.body;

    if (!first_name || !first_name.trim() || !last_name || !last_name.trim()) {
      return res.status(400).json({ error: 'First and last name are required' });
    }

    const normalizedFirst = first_name.trim();
    const normalizedLast = last_name.trim();
    const normalizedNickname = nickname ? nickname.trim() : null;
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const normalizedMobileNumber = mobile_number ? mobile_number.trim() : null;
    const normalizedAddress = address ? address.trim() : null;
    const normalizedBankDetails = bank_details ? bank_details.trim() : null;
    const normalizedDate = date_of_employment ? toIsoDate(date_of_employment) : null;
    const normalizedLeftAt = left_at ? toIsoDate(left_at) : null;
    const normalizedLoginNo = login_no != null && String(login_no).trim() !== ''
      ? String(login_no).trim()
      : null;

    if (date_of_employment && !normalizedDate) {
      return res.status(400).json({
        error: 'Date of employment must be DD-MM-YYYY'
      });
    }

    if (left_at && !normalizedLeftAt) {
      return res.status(400).json({
        error: 'Date ceased employment must be DD-MM-YYYY'
      });
    }

    const [[nameMatch]] = await db.query(
      `SELECT id FROM workers WHERE first_name = ? AND last_name = ? LIMIT 1`,
      [normalizedFirst, normalizedLast]
    );

    if (nameMatch) {
      return res.status(400).json({
        error: 'A worker with the same first and last name already exists'
      });
    }

    if (employee_id) {
      const [[employeeMatch]] = await db.query(
        `SELECT id FROM workers WHERE employee_id = ? LIMIT 1`,
        [employee_id]
      );

      if (employeeMatch) {
        return res.status(400).json({
          error: 'This employee ID is already in use'
        });
      }
    }

    if (normalizedLoginNo && !/^\d+$/.test(normalizedLoginNo)) {
      return res.status(400).json({
        error: 'Login number must be numeric'
      });
    }

    if (normalizedLoginNo) {
      const [[loginNoMatch]] = await db.query(
        `SELECT id FROM workers WHERE login_no = ? LIMIT 1`,
        [normalizedLoginNo]
      );

      if (loginNoMatch) {
        return res.status(400).json({
          error: 'This login number is already in use'
        });
      }
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isActive = !normalizedLeftAt || new Date(`${normalizedLeftAt}T00:00:00`) >= today;
      const [result] = await db.query(
        `INSERT INTO workers
         (first_name, last_name, nickname, email, mobile_number, address, bank_details, pps_number, weekly_take_home, weekly_cost, safe_pass_number, safe_pass_expiry_date, date_of_employment, left_at, employee_id, login_no, notes, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalizedFirst,
          normalizedLast,
          normalizedNickname || null,
          normalizedEmail || null,
          normalizedMobileNumber || null,
          normalizedAddress || null,
          normalizedBankDetails || null,
          pps_number || null,
          weekly_take_home ?? null,
          weekly_cost ?? null,
          safe_pass_number || null,
          toIsoDate(safe_pass_expiry_date),
          normalizedDate,
          normalizedLeftAt,
          employee_id || null,
          normalizedLoginNo,
          notes || null,
          isActive ? 1 : 0
        ]
      );

      logAudit({
        table_name: 'workers',
        record_id: result.insertId,
        action: 'CREATE',
        old_data: null,
        new_data: { first_name: normalizedFirst, last_name: normalizedLast, employee_id, login_no: normalizedLoginNo, active: isActive },
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Worker create audit log failed:', err));

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
      nickname,
      email,
      mobile_number,
      address,
      bank_details,
      pps_number,
      weekly_take_home,
      weekly_cost,
      safe_pass_number,
      safe_pass_expiry_date,
      date_of_employment,
      left_at,
      employee_id,
      login_no,
      notes
    } = req.body;

    if (!first_name || !first_name.trim() || !last_name || !last_name.trim()) {
      return res.status(400).json({ error: 'First and last name are required' });
    }

    const normalizedFirst = first_name.trim();
    const normalizedLast = last_name.trim();
    const normalizedNickname = nickname ? nickname.trim() : null;
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const normalizedMobileNumber = mobile_number ? mobile_number.trim() : null;
    const normalizedAddress = address ? address.trim() : null;
    const normalizedBankDetails = bank_details ? bank_details.trim() : null;
    const normalizedDate = date_of_employment ? toIsoDate(date_of_employment) : null;
    const normalizedLeftAt = left_at ? toIsoDate(left_at) : null;
    const normalizedLoginNo = login_no != null && String(login_no).trim() !== ''
      ? String(login_no).trim()
      : null;

    if (date_of_employment && !normalizedDate) {
      return res.status(400).json({
        error: 'Date of employment must be DD-MM-YYYY'
      });
    }

    if (left_at && !normalizedLeftAt) {
      return res.status(400).json({
        error: 'Date ceased employment must be DD-MM-YYYY'
      });
    }

    const [[nameMatch]] = await db.query(
      `SELECT id FROM workers WHERE first_name = ? AND last_name = ? AND id <> ? LIMIT 1`,
      [normalizedFirst, normalizedLast, workerId]
    );

    if (nameMatch) {
      return res.status(400).json({
        error: 'A worker with the same first and last name already exists'
      });
    }

    if (employee_id) {
      const [[employeeMatch]] = await db.query(
        `SELECT id FROM workers WHERE employee_id = ? AND id <> ? LIMIT 1`,
        [employee_id, workerId]
      );

      if (employeeMatch) {
        return res.status(400).json({
          error: 'This employee ID is already in use'
        });
      }
    }

    if (normalizedLoginNo && !/^\d+$/.test(normalizedLoginNo)) {
      return res.status(400).json({
        error: 'Login number must be numeric'
      });
    }

    if (normalizedLoginNo) {
      const [[loginNoMatch]] = await db.query(
        `SELECT id FROM workers WHERE login_no = ? AND id <> ? LIMIT 1`,
        [normalizedLoginNo, workerId]
      );

      if (loginNoMatch) {
        return res.status(400).json({
          error: 'This login number is already in use'
        });
      }
    }

    try {
      const [[oldWorker]] = await db.query(
        'SELECT * FROM workers WHERE id = ?',
        [workerId]
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isActive = !normalizedLeftAt || new Date(`${normalizedLeftAt}T00:00:00`) >= today;
      await db.query(
        `UPDATE workers
         SET
           first_name = ?,
           last_name = ?,
           nickname = ?,
           email = ?,
           mobile_number = ?,
           address = ?,
           bank_details = ?,
           pps_number = ?,
           weekly_take_home = ?,
           weekly_cost = ?,
           safe_pass_number = ?,
           safe_pass_expiry_date = ?,
           date_of_employment = ?,
           left_at = ?,
           employee_id = ?,
           login_no = ?,
           notes = ?,
           active = ?
         WHERE id = ?`,
        [
          normalizedFirst,
          normalizedLast,
          normalizedNickname || null,
          normalizedEmail || null,
          normalizedMobileNumber || null,
          normalizedAddress || null,
          normalizedBankDetails || null,
          pps_number || null,
          weekly_take_home ?? null,
          weekly_cost ?? null,
          safe_pass_number || null,
          toIsoDate(safe_pass_expiry_date),
          normalizedDate,
          normalizedLeftAt,
          employee_id || null,
          normalizedLoginNo,
          notes || null,
          isActive ? 1 : 0,
          workerId
        ]
      );

      if (oldWorker) {
        logAudit({
          table_name: 'workers',
          record_id: workerId,
          action: 'UPDATE',
          old_data: { first_name: oldWorker.first_name, last_name: oldWorker.last_name, employee_id: oldWorker.employee_id, login_no: oldWorker.login_no, active: oldWorker.active },
          new_data: { first_name: normalizedFirst, last_name: normalizedLast, employee_id, login_no: normalizedLoginNo, active: isActive },
          changed_by: req.user.id,
          req
        }).catch(err => console.error('Worker update audit log failed:', err));
      }

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
      const [[oldWorker]] = await db.query(
        'SELECT * FROM workers WHERE id = ?',
        [workerId]
      );

      await db.query(
        `UPDATE workers
         SET active = ?, left_at = ?
         WHERE id = ?`,
        [active, active ? null : new Date(), workerId]
      );

      if (oldWorker) {
        logAudit({
          table_name: 'workers',
          record_id: workerId,
          action: 'UPDATE',
          old_data: { active: oldWorker.active, left_at: oldWorker.left_at },
          new_data: { active, left_at: active ? null : new Date() },
          changed_by: req.user.id,
          req
        }).catch(err => console.error('Worker status update audit log failed:', err));
      }

      res.json({ success: true });
    } catch (err) {
      console.error('UPDATE WORKER STATUS ERROR:', err);
      res.status(500).json({ error: 'Failed to update worker status' });
    }
  }
);

router.get(
  '/workers/template',
  authenticate,
  authorizeRoles('super_admin'),
  async (_req, res) => {
    try {
      const [activeWorkers] = await db.query(
        `SELECT
           first_name,
           last_name,
           nickname,
           email,
           mobile_number,
           address,
           bank_details,
           pps_number,
           weekly_take_home,
           weekly_cost,
           safe_pass_number,
           safe_pass_expiry_date,
           date_of_employment,
           login_no,
           notes
         FROM workers
         WHERE left_at IS NULL OR left_at >= CURDATE()
         ORDER BY last_name, first_name`
      );

      const [inactiveWorkers] = await db.query(
        `SELECT
           first_name,
           last_name,
           nickname,
           email,
           mobile_number,
           address,
           bank_details,
           pps_number,
           weekly_take_home,
           weekly_cost,
           safe_pass_number,
           safe_pass_expiry_date,
           date_of_employment,
           login_no,
           notes
         FROM workers
         WHERE left_at IS NOT NULL AND left_at < CURDATE()
         ORDER BY last_name, first_name`
      );

      const workbook = new ExcelJS.Workbook();

      const columns = [
        { header: 'First Name', key: 'first_name', width: 20 },
        { header: 'Last Name', key: 'last_name', width: 20 },
        { header: 'Nickname', key: 'nickname', width: 18 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Mobile Number', key: 'mobile_number', width: 16 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'Bank Details', key: 'bank_details', width: 25 },
        { header: 'PPS Number', key: 'pps_number', width: 18 },
        { header: 'Weekly Take Home', key: 'weekly_take_home', width: 18 },
        { header: 'Weekly Cost', key: 'weekly_cost', width: 16 },
        { header: 'Safe Pass Number', key: 'safe_pass_number', width: 18 },
        { header: 'Safe Pass Expiry (DD-MM-YYYY)', key: 'safe_pass_expiry_date', width: 26 },
        { header: 'Date of Employment (DD-MM-YYYY)', key: 'date_of_employment', width: 26 },
        { header: 'Login No', key: 'login_no', width: 16 },
        { header: 'Notes', key: 'notes', width: 30 }
      ];

      const addWorkersSheet = (sheetName, rows) => {
        const sheet = workbook.addWorksheet(sheetName);
        sheet.columns = columns;

        rows.forEach(worker => {
          sheet.addRow({
            first_name: worker.first_name || '',
            last_name: worker.last_name || '',
            nickname: worker.nickname || '',
            email: worker.email || '',
            mobile_number: worker.mobile_number || '',
            address: worker.address || '',
            bank_details: worker.bank_details || '',
            pps_number: worker.pps_number || '',
            weekly_take_home: worker.weekly_take_home ?? null,
            weekly_cost: worker.weekly_cost ?? null,
            safe_pass_number: worker.safe_pass_number || '',
            safe_pass_expiry_date: toUkDate(worker.safe_pass_expiry_date),
            date_of_employment: toUkDate(worker.date_of_employment),
            login_no: worker.login_no ?? '',
            notes: worker.notes || ''
          });
        });
      };

      addWorkersSheet('Active Workers', activeWorkers);
      addWorkersSheet('Inactive Workers', inactiveWorkers);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="workers-template.xlsx"'
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('WORKERS TEMPLATE ERROR:', err);
      res.status(500).json({ error: 'Failed to generate template' });
    }
  }
);

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

router.post(
  '/workers/bulk',
  authenticate,
  authorizeRoles('super_admin'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        return res.status(400).json({ error: 'No worksheet found in file' });
      }

      const [existingWorkers] = await db.query(
        'SELECT id, first_name, last_name, login_no FROM workers'
      );
      const existingByName = new Map(
        existingWorkers.map(worker => [
          `${String(worker.first_name).trim().toLowerCase()}|${String(worker.last_name).trim().toLowerCase()}`,
          worker
        ])
      );
      const existingNames = new Set(existingByName.keys());
      const existingLoginNos = new Map(
        existingWorkers
          .filter(worker => worker.login_no != null && String(worker.login_no).trim() !== '')
          .map(worker => [String(worker.login_no).trim(), worker.id])
      );
      const seenNames = new Set();
      const seenLoginNos = new Map();

      const headerRow = sheet.getRow(1);
      const headerMap = {};
      headerRow.eachCell((cell, colNumber) => {
        headerMap[normalizeHeader(cell.value)] = colNumber;
      });

      const rowsToInsert = [];
      const rowsToUpdate = [];
      const skipped = [];

      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        if (!row || row.actualCellCount === 0) continue;

        const firstName = String(row.getCell(headerMap.first_name || 1).value || '').trim();
        const lastName = String(row.getCell(headerMap.last_name || 2).value || '').trim();

        if (!firstName || !lastName) {
          skipped.push({ row: rowNumber, reason: 'Missing first or last name' });
          continue;
        }

        const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
        if (seenNames.has(nameKey)) {
          skipped.push({ row: rowNumber, reason: 'Duplicate first and last name' });
          continue;
        }

        const ppsNumber = row.getCell(headerMap.pps_number || 4).value;
        const nicknameValue = row.getCell(headerMap.nickname || 3).value;
        const emailValue = row.getCell(headerMap.email || 4).value;
        const mobileNumberValue = row.getCell(headerMap.mobile_number || 5).value;
        const addressValue = row.getCell(headerMap.address || 6).value;
        const bankDetailsValue = row.getCell(headerMap.bank_details || 7).value;
        const weeklyTakeHomeValue = row.getCell(headerMap.weekly_take_home || 9).value;
        const weeklyCostValue = row.getCell(headerMap.weekly_cost || 10).value;
        const safePassNumberValue = row.getCell(headerMap.safe_pass_number || 11).value;
        const safePassExpiryValue = row.getCell(headerMap.safe_pass_expiry_date || 12).value;
        const dateValue = row.getCell(headerMap.date_of_employment || 13).value;
        const loginNo = row.getCell(headerMap.login_no || 14).value;
        const notes = row.getCell(headerMap.notes || 15).value;

        const weeklyTakeHome = weeklyTakeHomeValue !== null && weeklyTakeHomeValue !== ''
          ? Number(weeklyTakeHomeValue)
          : null;
        const weeklyCost = weeklyCostValue !== null && weeklyCostValue !== ''
          ? Number(weeklyCostValue)
          : null;

        if ((weeklyTakeHome !== null && !Number.isFinite(weeklyTakeHome)) ||
            (weeklyCost !== null && !Number.isFinite(weeklyCost))) {
          skipped.push({ row: rowNumber, reason: 'Weekly amounts must be numbers' });
          continue;
        }

        const normalizedLoginNo = loginNo != null && String(loginNo).trim() !== ''
          ? String(loginNo).trim()
          : '';
        if (normalizedLoginNo && !/^\d+$/.test(normalizedLoginNo)) {
          skipped.push({ row: rowNumber, reason: 'Login number must be numeric' });
          continue;
        }

        const normalizedDate = toIsoDate(dateValue);
        if (dateValue && !normalizedDate) {
          skipped.push({ row: rowNumber, reason: 'Invalid date of employment (DD-MM-YYYY)' });
          continue;
        }

        const normalizedSafePassExpiry = toIsoDate(safePassExpiryValue);
        if (safePassExpiryValue && !normalizedSafePassExpiry) {
          skipped.push({ row: rowNumber, reason: 'Invalid safe pass expiry (DD-MM-YYYY)' });
          continue;
        }

        const existingWorker = existingByName.get(nameKey);
        if (existingWorker) {
          if (normalizedLoginNo) {
            const currentMatchId = existingLoginNos.get(normalizedLoginNo);
            const seenMatchId = seenLoginNos.get(normalizedLoginNo);
            if ((currentMatchId && currentMatchId !== existingWorker.id) ||
                (seenMatchId && seenMatchId !== existingWorker.id)) {
              skipped.push({ row: rowNumber, reason: 'Duplicate login number' });
              continue;
            }
            seenLoginNos.set(normalizedLoginNo, existingWorker.id);
          }

          rowsToUpdate.push([
            firstName,
            lastName,
            nicknameValue ? String(nicknameValue).trim() : null,
            emailValue ? String(emailValue).trim().toLowerCase() : null,
            mobileNumberValue ? String(mobileNumberValue).trim() : null,
            addressValue ? String(addressValue).trim() : null,
            bankDetailsValue ? String(bankDetailsValue).trim() : null,
            ppsNumber ? String(ppsNumber).trim() : null,
            weeklyTakeHome,
            weeklyCost,
            safePassNumberValue ? String(safePassNumberValue).trim() : null,
            normalizedSafePassExpiry,
            normalizedDate,
            normalizedLoginNo || null,
            notes ? String(notes).trim() : null,
            existingWorker.id
          ]);
          seenNames.add(nameKey);
          continue;
        }

        if (existingNames.has(nameKey) || seenNames.has(nameKey)) {
          skipped.push({ row: rowNumber, reason: 'Duplicate first and last name' });
          continue;
        }

        if (normalizedLoginNo) {
          const currentMatchId = existingLoginNos.get(normalizedLoginNo);
          const seenMatchId = seenLoginNos.get(normalizedLoginNo);
          if (currentMatchId || seenMatchId) {
            skipped.push({ row: rowNumber, reason: 'Duplicate login number' });
            continue;
          }
          seenLoginNos.set(normalizedLoginNo, -1);
        }

        seenNames.add(nameKey);

        rowsToInsert.push([
          firstName,
          lastName,
          nicknameValue ? String(nicknameValue).trim() : null,
          emailValue ? String(emailValue).trim().toLowerCase() : null,
          mobileNumberValue ? String(mobileNumberValue).trim() : null,
          addressValue ? String(addressValue).trim() : null,
          bankDetailsValue ? String(bankDetailsValue).trim() : null,
          ppsNumber ? String(ppsNumber).trim() : null,
          weeklyTakeHome,
          weeklyCost,
          safePassNumberValue ? String(safePassNumberValue).trim() : null,
          normalizedSafePassExpiry,
          normalizedDate,
          normalizedLoginNo || null,
          notes ? String(notes).trim() : null,
          1
        ]);
      }

      if (rowsToInsert.length > 0) {
        await db.query(
          `INSERT INTO workers
           (first_name, last_name, nickname, email, mobile_number, address, bank_details, pps_number, weekly_take_home, weekly_cost, safe_pass_number, safe_pass_expiry_date, date_of_employment, login_no, notes, active)
           VALUES ?`,
          [rowsToInsert]
        );
      }

      if (rowsToUpdate.length > 0) {
        for (const updateValues of rowsToUpdate) {
          await db.query(
            `UPDATE workers
             SET
               first_name = ?,
               last_name = ?,
               nickname = ?,
               email = ?,
               mobile_number = ?,
               address = ?,
               bank_details = ?,
               pps_number = ?,
               weekly_take_home = ?,
               weekly_cost = ?,
               safe_pass_number = ?,
               safe_pass_expiry_date = ?,
               date_of_employment = ?,
               login_no = ?,
               notes = ?
             WHERE id = ?`,
            updateValues
          );
        }
      }

      res.json({
        success: true,
        inserted: rowsToInsert.length,
        updated: rowsToUpdate.length,
        skipped
      });
    } catch (err) {
      console.error('BULK WORKER UPLOAD ERROR:', err);
      res.status(500).json({ error: 'Failed to import workers' });
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

      // Fetch stage details before merge
      const [[keepStage]] = await db.query(
        'SELECT * FROM po_stages WHERE id = ?',
        [keep_stage_id]
      );

      const [[mergeStage]] = await db.query(
        'SELECT * FROM po_stages WHERE id = ?',
        [merge_stage_id]
      );

      if (!keepStage || !mergeStage) {
        return res.status(404).json({ error: 'Stage not found' });
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

      // Audit log
      await logAudit({
        table_name: 'po_stages',
        record_id: merge_stage_id,
        action: 'MERGE',
        old_data: mergeStage,
        new_data: { merged_into: keep_stage_id, target_name: keepStage.name },
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error merging stages:', error);
      res.status(500).json({ 
        error: 'Failed to merge stages',
        details: error.message 
      });
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

    const [result] = await db.query(
      `INSERT INTO locations (name, type, site_id)
       VALUES (?, ?, ?)`,
      [name.trim(), type || null, site_id]
    );

    logAudit({
      table_name: 'locations',
      record_id: result.insertId,
      action: 'CREATE',
      old_data: null,
      new_data: { name: name.trim(), type, site_id },
      changed_by: req.user.id,
      req
    }).catch(err => console.error('Location create audit log failed:', err));

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

    const [[oldLocation]] = await db.query(
      'SELECT * FROM locations WHERE id = ?',
      [locationId]
    );

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

    if (oldLocation) {
      logAudit({
        table_name: 'locations',
        record_id: locationId,
        action: 'UPDATE',
        old_data: { name: oldLocation.name, type: oldLocation.type, site_id: oldLocation.site_id },
        new_data: { name: name.trim(), type, site_id },
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Location update audit log failed:', err));
    }

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

    const [[location]] = await db.query(
      'SELECT * FROM locations WHERE id = ?',
      [locationId]
    );

    await db.query(
      `DELETE FROM locations WHERE id = ?`,
      [locationId]
    );

    if (location) {
      logAudit({
        table_name: 'locations',
        record_id: locationId,
        action: 'DELETE',
        old_data: location,
        new_data: null,
        changed_by: req.user.id,
        req
      }).catch(err => console.error('Location delete audit log failed:', err));
    }

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

        // Audit log
        await logAudit({
          table_name: 'locations',
          record_id: merge_location_id,
          action: 'MERGE',
          old_data: mergeLoc[0],
          new_data: { merged_into: keep_location_id, target_name: keepLoc[0].name },
          changed_by: req.user.id,
          req
        });

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
