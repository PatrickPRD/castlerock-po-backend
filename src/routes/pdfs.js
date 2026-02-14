/**
 * PDF Routes
 * Handles PDF generation and download
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFService = require('../services/pdfService');
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

function getLeaveYearStartDate(startYear, leaveYearStart) {
  const [monthStr, dayStr] = leaveYearStart.split('-');
  const startMonth = Number(monthStr);
  const startDay = Number(dayStr);
  return new Date(startYear, startMonth - 1, startDay);
}

/**
 * GET /pdfs/po/:poId
 * Download a PO as PDF
 * Accessible to: super_admin, admin, staff, viewer
 */
router.get(
  '/po/:poId',
  authenticate,
  async (req, res) => {
    try {
      const { poId } = req.params;
      const token = req.headers.authorization?.split(' ')[1];

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
          
          s.name AS supplier,
          si.name AS site,
          si.address AS site_address,
          l.name AS location,
          ps.name AS stage
          
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

      // Fetch invoices for this PO
      const [invoices] = await db.query(`
        SELECT
          i.id,
          i.invoice_number,
          DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
          i.net_amount,
          i.vat_rate,
          i.vat_amount,
          i.total_amount
        FROM invoices i
        WHERE i.purchase_order_id = ?
        ORDER BY i.invoice_date DESC
      `, [poId]);

      const [lineItems] = await db.query(`
        SELECT
          line_number,
          description,
          quantity,
          unit,
          unit_price,
          line_total
        FROM po_line_items
        WHERE po_id = ?
        ORDER BY line_number ASC, id ASC
      `, [poId]);

      poData.line_items = lineItems;

      // Fetch settings
      const settings = await SettingsService.getSettings();

      // Generate PDF
      const pdf = await PDFService.generatePOPDF(poData, invoices, settings);

      // Send PDF
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PO-${poData.po_number}.pdf"`,
        'Content-Length': pdf.length
      });

      res.send(pdf);
    } catch (error) {
      console.error('Error generating PO PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  }
);

/**
 * GET /pdfs/po-preview/:poId
 * Get PO as inline PDF (view in browser)
 */
router.get(
  '/po-preview/:poId',
  authenticate,
  async (req, res) => {
    try {
      const { poId } = req.params;

      // Verify user has access
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
          po.created_at,
          
          s.name AS supplier,
          si.name AS site,
          si.address AS site_address,
          l.name AS location,
          ps.name AS stage
          
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

      // Fetch invoices for this PO
      const [invoices] = await db.query(`
        SELECT
          i.id,
          i.invoice_number,
          DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
          i.net_amount,
          i.vat_rate,
          i.vat_amount,
          i.total_amount
        FROM invoices i
        WHERE i.purchase_order_id = ?
        ORDER BY i.invoice_date DESC
      `, [poId]);

      const [lineItems] = await db.query(`
        SELECT
          line_number,
          description,
          quantity,
          unit,
          unit_price,
          line_total
        FROM po_line_items
        WHERE po_id = ?
        ORDER BY line_number ASC, id ASC
      `, [poId]);

      poData.line_items = lineItems;

      // Fetch settings
      const settings = await SettingsService.getSettings();

      // Generate PDF
      const pdf = await PDFService.generatePOPDF(poData, invoices, settings);

      // Send PDF inline for viewing
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="PO-${poData.po_number}.pdf"`,
        'Content-Length': pdf.length
      });

      res.send(pdf);
    } catch (error) {
      console.error('Error generating PO preview:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  }
);

/**
 * GET /pdfs/worker/:workerId
 * Download a worker summary PDF
 * Accessible to: super_admin, admin
 * Note: Financial data is removed from PDF for all users
 */
router.get(
  '/worker/:workerId',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const { workerId } = req.params;

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
        LIMIT 1
        `,
        [workerId]
      );

      if (!workers || workers.length === 0) {
        return res.status(404).json({ error: 'Worker not found' });
      }

      const workerData = workers[0];
      const settings = await SettingsService.getSettings();
      const leaveYearStart = normalizeLeaveYearStart(settings.leave_year_start || '01-01');
      const paidSickAllowance = Number(settings.sick_days_per_year || 0);
      const annualLeaveAllowance = Number(settings.annual_leave_days_per_year || 0);
      const bankHolidayAllowance = Number(settings.bank_holidays_per_year || 0);
      const today = new Date();
      const { startDate: currentStartDate } = getLeaveYearBounds(today, leaveYearStart);
      const requestedYear = Number(req.query.year);
      const hasRequestedYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100;
      const selectedStartYear = hasRequestedYear ? requestedYear : currentStartDate.getFullYear();
      const startDate = getLeaveYearStartDate(selectedStartYear, leaveYearStart);
      const endDate = getLeaveYearStartDate(selectedStartYear + 1, leaveYearStart);

      const [[leaveTotals]] = await db.query(
        `
        SELECT
          SUM(CASE WHEN leave_type = 'paid_sick' THEN 1 ELSE 0 END) AS paid_sick,
          SUM(CASE WHEN leave_type = 'sick' THEN 1 ELSE 0 END) AS sick,
          SUM(CASE WHEN leave_type = 'annual_leave' THEN 1 ELSE 0 END) AS annual_leave,
          SUM(CASE WHEN leave_type = 'unpaid_leave' THEN 1 ELSE 0 END) AS unpaid_leave,
          SUM(CASE WHEN leave_type = 'bank_holiday' THEN 1 ELSE 0 END) AS bank_holiday,
          SUM(CASE WHEN leave_type = 'absent' THEN 1 ELSE 0 END) AS absent
        FROM timesheet_entries
        WHERE worker_id = ?
          AND leave_type IS NOT NULL
          AND work_date >= ?
          AND work_date < ?
        `,
        [workerId, formatDate(startDate), formatDate(endDate)]
      );

      const totals = leaveTotals || {};
      const leaveSummary = {
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        leave_year_start: leaveYearStart,
        allowances: {
          paid_sick: paidSickAllowance,
          annual_leave: annualLeaveAllowance,
          bank_holiday: bankHolidayAllowance
        },
        totals: {
          paid_sick: Number(totals.paid_sick || 0),
          sick: Number(totals.sick || 0),
          annual_leave: Number(totals.annual_leave || 0),
          unpaid_leave: Number(totals.unpaid_leave || 0),
          bank_holiday: Number(totals.bank_holiday || 0),
          absent: Number(totals.absent || 0)
        }
      };

      leaveSummary.remaining = {
        paid_sick: Math.max(paidSickAllowance - leaveSummary.totals.paid_sick, 0),
        annual_leave: Math.max(annualLeaveAllowance - leaveSummary.totals.annual_leave, 0),
        bank_holiday: Math.max(bankHolidayAllowance - leaveSummary.totals.bank_holiday, 0)
      };

      const pdf = await PDFService.generateWorkerPDF(workerData, leaveSummary, settings);

      const safeName = `${workerData.last_name || 'Worker'}-${workerData.first_name || ''}`
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9-_]/g, '');

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Worker-${safeName}.pdf"`,
        'Content-Length': pdf.length
      });

      res.send(pdf);
    } catch (error) {
      console.error('Error generating worker PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  }
);

/**
 * GET /pdfs/worker-blank
 * Download a blank worker form PDF
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
      const paidSickAllowance = Number(settings.sick_days_per_year || 0);
      const annualLeaveAllowance = Number(settings.annual_leave_days_per_year || 0);
      const bankHolidayAllowance = Number(settings.bank_holidays_per_year || 0);
      const today = new Date();
      const { startDate: currentStartDate } = getLeaveYearBounds(today, leaveYearStart);
      const requestedYear = Number(req.query.year);
      const hasRequestedYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100;
      const selectedStartYear = hasRequestedYear ? requestedYear : currentStartDate.getFullYear();
      const startDate = getLeaveYearStartDate(selectedStartYear, leaveYearStart);
      const endDate = getLeaveYearStartDate(selectedStartYear + 1, leaveYearStart);

      const leaveSummary = {
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        leave_year_start: leaveYearStart,
        allowances: {
          paid_sick: paidSickAllowance,
          annual_leave: annualLeaveAllowance,
          bank_holiday: bankHolidayAllowance
        },
        totals: {
          paid_sick: 0,
          sick: 0,
          annual_leave: 0,
          unpaid_leave: 0,
          bank_holiday: 0,
          absent: 0
        },
        remaining: {
          paid_sick: paidSickAllowance,
          annual_leave: annualLeaveAllowance,
          bank_holiday: bankHolidayAllowance
        }
      };

      const pdf = await PDFService.generateBlankWorkerPDF(leaveSummary, settings);
      const yearSuffix = hasRequestedYear ? `-${selectedStartYear}` : '';

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Worker-Blank-Form${yearSuffix}.pdf"`,
        'Content-Length': pdf.length
      });

      res.send(pdf);
    } catch (error) {
      console.error('Error generating blank worker PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  }
);

/**
 * GET /pdfs/gdpr
 * Download GDPR Privacy Notice as PDF
 * Accessible to: all authenticated users
 */
router.get(
  '/gdpr',
  authenticate,
  async (req, res) => {
    try {
      // Get settings for company details
      const settings = await SettingsService.getSettings();
      
      // Generate GDPR PDF
      const pdf = await PDFService.generateGDPRPDF(settings);

      const companyName = (settings.company_name || 'Company').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
      const today = new Date().toISOString().split('T')[0];

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="GDPR-Privacy-Notice-${companyName}-${today}.pdf"`,
        'Content-Length': pdf.length
      });

      res.send(pdf);
    } catch (error) {
      console.error('Error generating GDPR PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  }
);

module.exports = router;
