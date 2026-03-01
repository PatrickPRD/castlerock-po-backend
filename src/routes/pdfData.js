/**
 * PDF Data Routes
 * Provides JSON data for browser-based PDF generation using PDFKit
 * Replaces server-side Puppeteer PDF generation to reduce RAM usage
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const SettingsService = require('../services/settingsService');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

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

function getLeaveYearBounds(anchorDate, leaveYearStart) {
  const [monthStr, dayStr] = leaveYearStart.split('-');
  const startMonth = Number(monthStr);
  const startDay = Number(dayStr);
  const anchor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  let startDate = new Date(anchor.getFullYear(), startMonth - 1, startDay);

  if (anchor < startDate) {
    startDate = new Date(anchor.getFullYear() - 1, startMonth - 1, startDay);
  }

  const endDate = new Date(startDate.getFullYear() + 1, startMonth - 1, startDay);
  return { startDate, endDate };
}

/**
 * GET /pdf-data/po/:poId
 * Get PO data as JSON for browser PDF generation
 * Accessible to: super_admin, admin, staff, viewer
 */
router.get(
  '/po/:poId',
  authenticate,
  async (req, res) => {
    try {
      const { poId } = req.params;

      // Verify user has access to view POs
      if (!['super_admin', 'admin', 'staff', 'viewer'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Fetch PO data
      const [pos] = await db.query(`
        SELECT
          po.id,
          po.po_number,
          po.po_date,
          po.net_amount AS po_net_amount,
          po.total_amount AS po_total_amount,
          po.vat_rate AS po_vat_rate,
          po.description,
          po.status,
          po.created_at,
          
          s.name AS supplier_name,
          s.address AS supplier_address,
          s.email AS supplier_email,
          s.phone AS supplier_phone,
          si.name AS site_name,
          si.address AS site_address,
          l.name AS location_name,
          ps.name AS stage_name
          
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN sites si ON po.site_id = si.id
        LEFT JOIN locations l ON po.location_id = l.id
        LEFT JOIN po_stages ps ON po.stage_id = ps.id
        
        WHERE po.id = ?
      `, [poId]);

      if (!pos || pos.length === 0) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const poData = pos[0];

      // Fetch line items
      const [lineItems] = await db.query(`
        SELECT
          description,
          quantity,
          unit,
          unit_price,
          line_total
        FROM po_line_items
        WHERE po_id = ?
        ORDER BY id
      `, [poId]);

      poData.line_items = lineItems;

      // Debug: Log line items for calculation
      console.log('Line items fetched:', lineItems.length);
      lineItems.forEach((item, idx) => {
        console.log(`  Item ${idx + 1}: qty=${item.quantity}, price=${item.unit_price}, total=${item.line_total}`);
      });

      // Fetch invoices
      const [invoices] = await db.query(`
        SELECT
          invoice_number,
          invoice_date,
          total_amount,
          notes
        FROM invoices
        WHERE purchase_order_id = ?
        ORDER BY invoice_date DESC
      `, [poId]);

      // Calculate totals - use line items if available, otherwise use PO stored amounts
      let subtotal, vatAmount, total;
      
      if (lineItems.length > 0) {
        // Calculate from line items
        subtotal = lineItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
        const vatRate = Number(poData.po_vat_rate || 0);
        vatAmount = subtotal * (vatRate / 100);
        total = subtotal + vatAmount;
        console.log('Calculated totals from line items:', { subtotal, vatRate, vatAmount, total });
      } else {
        // Fallback to PO stored amounts
        subtotal = Number(poData.po_net_amount || 0);
        total = Number(poData.po_total_amount || 0);
        vatAmount = total - subtotal;
        console.log('Using PO stored amounts:', { subtotal, vatAmount, total });
      }

      poData.subtotal = subtotal;
      poData.vat_amount = vatAmount;
      poData.total = total;

      // Get settings
      const settings = await SettingsService.getSettings();

      // Add currency symbol
      const currencyCode = String(settings.currency_code || 'EUR').toUpperCase();
      const currencySymbol = {
        EUR: '€',
        GBP: '£',
        USD: '$'
      }[currencyCode] || currencyCode;

      settings.currency_symbol = currencySymbol;

      res.json({
        poData,
        invoices,
        settings
      });
    } catch (error) {
      console.error('Error fetching PO data:', error);
      res.status(500).json({ error: 'Failed to fetch PO data: ' + error.message });
    }
  }
);

/**
 * GET /pdf-data/worker/:workerId
 * Get worker data as JSON for browser PDF generation
 * Accessible to: super_admin, admin
 */
router.get(
  '/worker/:workerId',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const { workerId } = req.params;
      console.log('Fetching worker data for ID:', workerId);

      const [workers] = await db.query(
        `
        SELECT
          id,
          first_name,
          last_name,
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
          notes,
          left_at,
          active
        FROM workers
        WHERE id = ?
        `,
        [workerId]
      );

      console.log('Worker query result:', workers.length > 0 ? 'Found' : 'Not found');

      if (!workers || workers.length === 0) {
        return res.status(404).json({ error: 'Worker not found' });
      }

      const workerData = workers[0];

      // Get leave summary
      console.log('Fetching settings...');
      const settings = await SettingsService.getSettings();
      console.log('Settings fetched, leave_year_start:', settings.leave_year_start);
      
      const leaveYearStart = normalizeLeaveYearStart(settings.leave_year_start || '01-01');
      const anchorDate = new Date();
      const { startDate, endDate } = getLeaveYearBounds(anchorDate, leaveYearStart);

      console.log('Leave year bounds:', { startDate: formatDate(startDate), endDate: formatDate(endDate) });

      const [leaveDays] = await db.query(
        `
        SELECT
          leave_type,
          COUNT(*) AS total_days
        FROM timesheet_entries
        WHERE worker_id = ?
          AND work_date >= ?
          AND work_date < ?
          AND leave_type IN ('annual_leave', 'bank_holiday', 'sick')
        GROUP BY leave_type
        `,
        [workerId, formatDate(startDate), formatDate(endDate)]
      );

      console.log('Leave days query result:', leaveDays.length, 'rows');

      const leaveSummary = {
        totals: {
          annual_leave: 0,
          bank_holiday: 0,
          sick: 0
        },
        entitlements: {
          annual_leave: Number(settings.annual_leave_days_per_year || 20),
          bank_holiday: 9, // Standard UK bank holidays
          sick: Number(settings.sick_days_per_year || 3)
        }
      };

      leaveDays.forEach(row => {
        leaveSummary.totals[row.leave_type] = Number(row.total_days || 0);
      });

      const currencyCode = String(settings.currency_code || 'EUR').toUpperCase();
      const currencySymbol = {
        EUR: '€',
        GBP: '£',
        USD: '$'
      }[currencyCode] || currencyCode;

      settings.currency_symbol = currencySymbol;

      res.json({
        workerData,
        leaveSummary,
        settings,
        userRole: req.user.role
      });
    } catch (error) {
      console.error('Error fetching worker data:', error);
      res.status(500).json({ error: 'Failed to fetch worker data: ' + error.message });
    }
  }
);

/**
 * GET /pdf-data/worker-blank
 * Get blank worker form data as JSON
 * Accessible to: super_admin, admin
 */
router.get(
  '/worker-blank',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const settings = await SettingsService.getSettings();
      const leaveYearStart = normalizeLeaveYearStart(settings.leave_year_start || '01-01');

      const leaveSummary = {
        totals: {
          annual_leave: 0,
          bank_holiday: 0,
          sick: 0
        },
        entitlements: {
          annual_leave: Number(settings.annual_leave_days_per_year || 20),
          bank_holiday: 9,
          sick: Number(settings.sick_days_per_year || 3)
        }
      };

      const currencyCode = String(settings.currency_code || 'EUR').toUpperCase();
      const currencySymbol = {
        EUR: '€',
        GBP: '£',
        USD: '$'
      }[currencyCode] || currencyCode;

      settings.currency_symbol = currencySymbol;

      res.json({
        workerData: {},
        leaveSummary,
        settings,
        isBlank: true,
        userRole: req.user.role
      });
    } catch (error) {
      console.error('Error fetching blank worker data:', error);
      res.status(500).json({ error: 'Failed to fetch blank worker data: ' + error.message });
    }
  }
);

/**
 * GET /pdf-data/gdpr
 * Get GDPR privacy notice data as JSON
 * Accessible to: all authenticated users
 */
router.get(
  '/gdpr',
  authenticate,
  async (req, res) => {
    try {
      const settings = await SettingsService.getSettings();

      const currencyCode = String(settings.currency_code || 'EUR').toUpperCase();
      const currencySymbol = {
        EUR: '€',
        GBP: '£',
        USD: '$'
      }[currencyCode] || currencyCode;

      settings.currency_symbol = currencySymbol;

      res.json({
        settings
      });
    } catch (error) {
      console.error('Error fetching GDPR data:', error);
      res.status(500).json({ error: 'Failed to fetch GDPR data: ' + error.message });
    }
  }
);

module.exports = router;
