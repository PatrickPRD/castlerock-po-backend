const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');
const { generatePONumber } = require('../services/poService');
const logAudit = require('../services/auditService');

function normalizeLineItems(lineItems) {
  if (!Array.isArray(lineItems)) return [];

  return lineItems
    .map((item, index) => {
      const description = String(item.description || '').trim();
      const quantity = Number(item.quantity) || 0;
      const unit = item.unit ? String(item.unit).trim() : null;
      const unitPrice = Number(item.unitPrice ?? item.unit_price) || 0;

      return {
        line_number: index + 1,
        description,
        quantity,
        unit,
        unit_price: unitPrice
      };
    })
    .filter(item => item.description && item.quantity > 0 && item.unit_price >= 0);
}

function calculateLineItemsNet(lineItems) {
  return lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );
}

/* ======================================================
   GET ALL PURCHASE ORDERS (Dashboard)
   ====================================================== */
router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff', 'viewer'),
  async (req, res) => {

    const [rows] = await db.query(`
  SELECT
    po.id,
    po.po_number,
    DATE_FORMAT(po.po_date, '%Y-%m-%d') AS po_date,
    po.description,
    s.name AS supplier,
    si.name AS site,
    si.address AS site_address,
    l.name AS location,

    po.net_amount,
    po.vat_rate,
    po.total_amount,

    ps.name AS stage,
    po.stage_id,

    IFNULL(SUM(i.total_amount), 0) AS invoiced_total,
    (po.total_amount - IFNULL(SUM(i.total_amount), 0)) AS uninvoiced_total

  FROM purchase_orders po
  JOIN suppliers s ON po.supplier_id = s.id
  JOIN sites si ON po.site_id = si.id
  JOIN locations l ON po.location_id = l.id
  JOIN po_stages ps ON po.stage_id = ps.id
  LEFT JOIN invoices i ON i.purchase_order_id = po.id
  WHERE po.status IN ('Issued', 'open', 'approved', 'received')
  GROUP BY po.id
  ORDER BY po.po_date DESC
`);

    res.json(rows);
  }
);


/* ======================================================
  LINE ITEM SEARCH (SUGGESTIONS)
  ====================================================== */
router.get(
  '/line-items/search',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    const q = String(req.query.q || '').trim();

    if (!q) {
      return res.json([]);
    }

    const [rows] = await db.query(
      `
      SELECT
        description,
        MAX(updated_at) AS last_used
      FROM po_line_items
      WHERE description LIKE ?
      GROUP BY description
      ORDER BY last_used DESC
      LIMIT 10
      `,
      [`%${q}%`]
    );

    res.json(rows.map(row => row.description));
  }
);

/* ======================================================
   GET SINGLE PURCHASE ORDER
   ====================================================== */
router.get(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {

    const poId = req.params.id;

    /* ---------------- PO ---------------- */
    const [[po]] = await db.query(
 `
      SELECT
        po.id,
        po.po_number,
        DATE_FORMAT(po.po_date, '%Y-%m-%d') AS po_date,
        po.description,
        po.net_amount,
        po.vat_rate,
        po.vat_amount,
        po.total_amount,

        po.supplier_id,
        s.name AS supplier,

        po.site_id,
        si.name AS site,
        si.address AS site_address,

        po.location_id,
        l.name AS location,

        ps.name AS stage,
        po.stage_id

      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      JOIN sites si ON si.id = po.site_id
      JOIN locations l ON l.id = po.location_id
      JOIN po_stages ps ON ps.id = po.stage_id
      WHERE po.id = ?
      `,
      [req.params.id]
    );

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    /* ---------------- INVOICES ---------------- */
    const [invoices] = await db.query(
      `
      SELECT
        id,
        invoice_number,
        DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date,
        net_amount,
        vat_rate,
        total_amount
      FROM invoices
      WHERE purchase_order_id = ?
      ORDER BY invoice_date DESC
      `,
      [poId]
    );

    /* ---------------- LINE ITEMS ---------------- */
    const [lineItems] = await db.query(
      `
      SELECT
        id,
        line_number,
        description,
        quantity,
        unit,
        unit_price,
        line_total
      FROM po_line_items
      WHERE po_id = ?
      ORDER BY line_number ASC, id ASC
      `,
      [poId]
    );

    /* ---------------- UNINVOICED (EX VAT) ---------------- */
    const invoicedNet = invoices.reduce((sum, i) => sum + Number(i.net_amount), 0);
    po.uninvoiced_net = +(po.net_amount - invoicedNet).toFixed(2);

    po.invoices = invoices;
    po.line_items = lineItems;

    res.json(po);
  }
);


/* ======================================================
   CREATE PURCHASE ORDER
   ====================================================== */
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    const {
      supplierId,
      siteId,
      locationId,
      poDate,
      description,
      netAmount,
      vatRate,
      lineItems
    } = req.body;

    if (!supplierId || !siteId || !locationId || !poDate) {
      return res.status(400).json({
        error: 'Supplier, site, location and PO date are required'
      });
    }
    const { stageId } = req.body;

    if (!stageId) {
      return res.status(400).json({ error: 'Stage is required' });
    }
    try {
      const normalizedLineItems = normalizeLineItems(lineItems);
      const net = normalizedLineItems.length
        ? calculateLineItemsNet(normalizedLineItems)
        : Number(netAmount) || 0;
      const vatPercent = Number(vatRate) || 0;
      const vatDecimal = vatPercent / 100; // Convert percentage to decimal (13.5 -> 0.135)
      const total = net + (net * vatPercent / 100);

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const poNumber = await generatePONumber(conn, siteId);

        const [result] = await conn.query(`
          INSERT INTO purchase_orders
            (
              po_number,
              supplier_id,
              site_id,
              location_id,
              po_date,
              description,
              net_amount,
              vat_rate,
              total_amount,
              created_by,
              status,
              stage_id
            )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          poNumber,
          supplierId,
          siteId,
          locationId,
          poDate,
          normalizedLineItems.length ? '' : (description || ''),
          net,
          vatDecimal,
          total,
          req.user.id,
          'Issued',
          stageId
        ]);

        if (normalizedLineItems.length) {
          const values = normalizedLineItems.map((item, index) => [
            result.insertId,
            index + 1,
            item.description,
            item.quantity,
            item.unit,
            item.unit_price
          ]);

          await conn.query(
            `
            INSERT INTO po_line_items
              (po_id, line_number, description, quantity, unit, unit_price)
            VALUES ?
            `,
            [values]
          );
        }

        await conn.commit();
        
        // Fetch context for audit log
        const [[context]] = await conn.query(
          `SELECT s.name as supplier_name, si.name as site_name, l.name as location_name
           FROM suppliers s, sites si, locations l
           WHERE s.id = ? AND si.id = ? AND l.id = ?`,
          [supplierId, siteId, locationId]
        );
        
        // Audit log
        await logAudit({
          table_name: 'purchase_orders',
          record_id: result.insertId,
          action: 'CREATE',
          old_data: null,
          new_data: {
            po_number: poNumber,
            supplier: context.supplier_name,
            site: context.site_name,
            location: context.location_name,
            po_date: poDate,
            net_amount: net,
            vat_rate: vatDecimal,
            total_amount: total,
            line_items_count: normalizedLineItems.length
          },
          changed_by: req.user.id,
          req
        });
        
        res.status(201).json({
          success: true,
          poNumber,
          id: result.insertId
        });
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }

    } catch (err) {
      console.error('CREATE PO ERROR:', err);
      res.status(500).json({ error: 'Failed to create purchase order' });
    }
  }
);

/* ======================================================
   UPDATE PURCHASE ORDER (NO PO NUMBER CHANGE)
   ====================================================== */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    const { id } = req.params;
    const {
      supplierId,
      siteId,
      locationId,
      poDate,
      description,
      netAmount,
      vatRate,
      stageId,
      lineItems
    } = req.body;

    const normalizedLineItems = normalizeLineItems(lineItems);
    const net = normalizedLineItems.length
      ? calculateLineItemsNet(normalizedLineItems)
      : Number(netAmount) || 0;
    const vatPercent = Number(vatRate) || 0;
    const vatDecimal = vatPercent / 100; // Convert percentage to decimal (13.5 -> 0.135)
    const total = net + (net * vatPercent / 100);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Fetch old values for audit log
      const [[oldPO]] = await conn.query(
        'SELECT * FROM purchase_orders WHERE id = ?',
        [id]
      );

      await conn.query(`
        UPDATE purchase_orders
        SET
          supplier_id = ?,
          site_id = ?,
          location_id = ?,
          po_date = ?,
          description = ?,
          net_amount = ?,
          vat_rate = ?,
          total_amount = ?,
          stage_id = ?
        WHERE id = ?
      `, [
        supplierId,
        siteId,
        locationId,
        poDate,
        normalizedLineItems.length ? '' : (description || ''),
        net,
        vatDecimal,
        total,
        stageId,
        id
      ]);

      await conn.query(
        'DELETE FROM po_line_items WHERE po_id = ?',
        [id]
      );

      if (normalizedLineItems.length) {
        const values = normalizedLineItems.map((item, index) => [
          id,
          index + 1,
          item.description,
          item.quantity,
          item.unit,
          item.unit_price
        ]);

        await conn.query(
          `
          INSERT INTO po_line_items
            (po_id, line_number, description, quantity, unit, unit_price)
          VALUES ?
          `,
          [values]
        );
      }

      await conn.commit();
      
      // Fetch context for audit log
      const [[oldContext]] = await conn.query(
        `SELECT s.name as supplier_name, si.name as site_name, l.name as location_name, ps.name as stage_name
         FROM suppliers s, sites si, locations l, po_stages ps
         WHERE s.id = ? AND si.id = ? AND l.id = ? AND ps.id = ?`,
        [oldPO.supplier_id, oldPO.site_id, oldPO.location_id, oldPO.stage_id]
      );
      
      const [[newContext]] = await conn.query(
        `SELECT s.name as supplier_name, si.name as site_name, l.name as location_name, ps.name as stage_name
         FROM suppliers s, sites si, locations l, po_stages ps
         WHERE s.id = ? AND si.id = ? AND l.id = ? AND ps.id = ?`,
        [supplierId, siteId, locationId, stageId]
      );
      
      // Audit log
      await logAudit({
        table_name: 'purchase_orders',
        record_id: id,
        action: 'UPDATE',
        old_data: {
          po_number: oldPO.po_number,
          supplier: oldContext.supplier_name,
          site: oldContext.site_name,
          location: oldContext.location_name,
          stage: oldContext.stage_name,
          po_date: oldPO.po_date,
          net_amount: oldPO.net_amount,
          vat_rate: oldPO.vat_rate,
          total_amount: oldPO.total_amount
        },
        new_data: {
          po_number: oldPO.po_number,
          supplier: newContext.supplier_name,
          site: newContext.site_name,
          location: newContext.location_name,
          stage: newContext.stage_name,
          po_date: poDate,
          net_amount: net,
          vat_rate: vatDecimal,
          total_amount: total
        },
        changed_by: req.user.id,
        req
      });
      
      res.json({ success: true });
    } catch (error) {
      await conn.rollback();
      console.error('UPDATE PO ERROR:', error);
      res.status(500).json({ error: 'Failed to save changes' });
    } finally {
      conn.release();
    }
  }
);

/* ======================================================
   CANCEL PURCHASE ORDER (BLOCK IF INVOICES EXIST)
   ====================================================== */
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    const { id } = req.params;

    const [[check]] = await db.query(
      `SELECT COUNT(*) AS count FROM invoices WHERE purchase_order_id = ?`,
      [id]
    );

    if (check.count > 0) {
      return res.status(400).json({
        error: 'Cannot cancel PO with existing invoices'
      });
    }

    const [result] = await db.query(
      `
      UPDATE purchase_orders
      SET
        status = 'Closed',
        cancelled_at = NOW(),
        cancelled_by = ?
      WHERE id = ?
        AND cancelled_at IS NULL
      `,
      [req.user.id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        error: 'PO already cancelled or not found'
      });
    }

    // Fetch PO details for audit log
    const [[poDetails]] = await db.query(
      `SELECT po.po_number, s.name as supplier_name, si.name as site_name
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN sites si ON si.id = po.site_id
       WHERE po.id = ?`,
      [id]
    );
    
    // Audit log
    await logAudit({
      table_name: 'purchase_orders',
      record_id: id,
      action: 'CANCEL',
      old_data: { 
        po_number: poDetails.po_number,
        supplier: poDetails.supplier_name,
        site: poDetails.site_name,
        status: 'Issued' 
      },
      new_data: { 
        po_number: poDetails.po_number,
        supplier: poDetails.supplier_name,
        site: poDetails.site_name,
        status: 'Cancelled' 
      },
      changed_by: req.user.id,
      req
    });

    res.json({ success: true });
  }
);


module.exports = router;
