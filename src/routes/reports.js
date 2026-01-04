const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');





/* ======================================================
   PO TOTALS BY LOCATION (SUPER ADMIN ONLY)
   ====================================================== */
router.get(
  '/po-totals-by-location',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const [rows] = await db.query(`
      SELECT
        si.name AS site,
        l.name  AS location,

        -- PO totals (ex VAT)
        COALESCE(SUM(po.net_amount), 0) AS total_net,

        -- Invoice VAT
        COALESCE(SUM(i.vat_amount), 0) AS total_vat,

        -- Invoice gross
        COALESCE(SUM(i.total_amount), 0) AS total_gross,

        -- Uninvoiced (ex VAT only)
        COALESCE(SUM(po.net_amount), 0)
          - COALESCE(SUM(i.net_amount), 0)
          AS uninvoiced_total

      FROM purchase_orders po
      JOIN sites si ON po.site_id = si.id
      JOIN locations l ON po.location_id = l.id

      LEFT JOIN invoices i
        ON i.purchase_order_id = po.id

      WHERE po.cancelled_at IS NULL

      GROUP BY si.name, l.name
      ORDER BY si.name, l.name
    `);

    res.json(rows);
  }
);

/* ======================================================
   EXCEL EXPORT
   ====================================================== */

router.get(
  '/po-totals-by-location.xlsx',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {

    const [rows] = await db.query(`
      SELECT
        s.name  AS site,
        l.name  AS location,
        SUM(po.net_amount)                        AS total_po_net,
        SUM(IFNULL(i.vat_amount, 0))              AS total_invoice_vat,
        SUM(IFNULL(i.total_amount, 0))            AS total_invoice_gross,
        SUM(po.net_amount)
          - SUM(IFNULL(i.net_amount, 0))           AS uninvoiced_net
      FROM purchase_orders po
      JOIN sites s      ON po.site_id = s.id
      JOIN locations l  ON po.location_id = l.id
      LEFT JOIN invoices i ON i.purchase_order_id = po.id
      WHERE po.cancelled_at IS NULL
      GROUP BY s.name, l.name
      ORDER BY s.name, l.name
    `);

    // Group rows by site
    const sites = {};
    rows.forEach(r => {
      if (!sites[r.site]) sites[r.site] = [];
      sites[r.site].push(r);
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Castlerock Homes';
    workbook.created = new Date();

    Object.entries(sites).forEach(([siteName, data]) => {
      const sheet = workbook.addWorksheet(siteName.substring(0, 31));

      sheet.columns = [
        { header: 'Location', key: 'location', width: 30 },
        { header: 'Total PO Net (€)', key: 'total_po_net', width: 18 },
        { header: 'Invoice VAT (€)', key: 'total_invoice_vat', width: 18 },
        { header: 'Invoice Gross (€)', key: 'total_invoice_gross', width: 20 },
        { header: 'Uninvoiced (ex VAT €)', key: 'uninvoiced_net', width: 22 }
      ];

      data.forEach(r => {
        sheet.addRow({
          location: r.location,
          total_po_net: Number(r.total_po_net || 0),
          total_invoice_vat: Number(r.total_invoice_vat || 0),
          total_invoice_gross: Number(r.total_invoice_gross || 0),
          uninvoiced_net: Number(r.uninvoiced_net || 0)
        });
      });

      const lastDataRow = sheet.rowCount;

      // Totals row
      const totalRow = sheet.addRow({
        location: 'TOTAL'
      });

      totalRow.font = { bold: true };

      totalRow.getCell(2).value = {
        formula: `SUM(B2:B${lastDataRow})`
      };
      totalRow.getCell(3).value = {
        formula: `SUM(C2:C${lastDataRow})`
      };
      totalRow.getCell(4).value = {
        formula: `SUM(D2:D${lastDataRow})`
      };
      totalRow.getCell(5).value = {
        formula: `SUM(E2:E${lastDataRow})`
      };

      // Formatting
      ['B', 'C', 'D', 'E'].forEach(col => {
        sheet.getColumn(col).numFmt = '€#,##0.00';
      });

      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="po-totals-by-location.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  }
);

/* ======================================================
   PO TOTALS BY SUPPLIER
   ====================================================== */
router.get(
  '/po-totals-by-supplier',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {

    const { siteId } = req.query;
    const params = [];
    let siteFilter = '';

    if (siteId) {
      siteFilter = 'AND po.site_id = ?';
      params.push(siteId);
    }

    const [rows] = await db.query(
      `
      SELECT
        s.id,
        s.name AS supplier,

        ROUND(SUM(po.net_amount), 2)                                   AS total_po_net,
        ROUND(SUM(po.vat_amount), 2)                                   AS total_po_vat,
        ROUND(SUM(po.total_amount), 2)                                 AS total_po_gross,

        ROUND(IFNULL(SUM(i.net_amount), 0), 2)                          AS total_invoiced_net,

        ROUND(
          SUM(po.net_amount) - IFNULL(SUM(i.net_amount), 0),
          2
        )                                                               AS uninvoiced_net

      FROM suppliers s
      JOIN purchase_orders po ON po.supplier_id = s.id
      LEFT JOIN invoices i ON i.purchase_order_id = po.id

      WHERE po.cancelled_at IS NULL
        ${siteFilter}

      GROUP BY s.id, s.name
      HAVING total_po_net <> 0
      ORDER BY s.name
      `,
      params
    );

    res.json(rows);
  }
);



/* ======================================================
   EXCEL EXPORT — PO TOTALS BY SUPPLIER
   ====================================================== */
router.get(
  '/supplier-totals.xlsx',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {

    const siteId = req.query.siteId;
    const siteWhere = siteId ? 'AND po.site_id = ?' : '';

    const params = siteId ? [siteId] : [];

    const [rows] = await db.query(
      `
      SELECT
        s.name AS supplier,

        SUM(po.net_amount)   AS po_net,
        SUM(po.vat_amount)   AS po_vat,
        SUM(po.total_amount) AS po_gross,

        COALESCE(inv.invoiced_net, 0) AS invoiced_net,
        (SUM(po.net_amount) - COALESCE(inv.invoiced_net, 0)) AS uninvoiced_net

      FROM suppliers s
      JOIN purchase_orders po
        ON po.supplier_id = s.id
        AND po.status <> 'Closed'

      LEFT JOIN (
        SELECT
          purchase_order_id,
          SUM(net_amount) AS invoiced_net
        FROM invoices
        GROUP BY purchase_order_id
      ) inv ON inv.purchase_order_id = po.id

      WHERE 1=1
      ${siteWhere}

      GROUP BY s.id
      HAVING uninvoiced_net <> 0
      ORDER BY s.name
      `,
      params
    );

    /* =========================
       EXCEL
       ========================= */
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Supplier Totals');

    sheet.columns = [
      { header: 'Supplier', key: 'supplier', width: 30 },
      { header: 'PO Net (€)', key: 'po_net', width: 15 },
      { header: 'PO VAT (€)', key: 'po_vat', width: 15 },
      { header: 'PO Gross (€)', key: 'po_gross', width: 18 },
      { header: 'Invoiced Net (€)', key: 'invoiced_net', width: 18 },
      { header: 'Uninvoiced Net (€)', key: 'uninvoiced_net', width: 18 }
    ];

    let totalPoNet = 0;
    let totalPoVat = 0;
    let totalPoGross = 0;
    let totalInvoiced = 0;
    let totalUninvoiced = 0;

    rows.forEach(r => {
      const row = {
        supplier: r.supplier,
        po_net: Number(r.po_net || 0),
        po_vat: Number(r.po_vat || 0),
        po_gross: Number(r.po_gross || 0),
        invoiced_net: Number(r.invoiced_net || 0),
        uninvoiced_net: Number(r.uninvoiced_net || 0)
      };

      totalPoNet += row.po_net;
      totalPoVat += row.po_vat;
      totalPoGross += row.po_gross;
      totalInvoiced += row.invoiced_net;
      totalUninvoiced += row.uninvoiced_net;

      sheet.addRow(row);
    });

    /* =========================
       TOTALS ROW
       ========================= */
    const totalRow = sheet.addRow({
      supplier: 'TOTAL',
      po_net: totalPoNet,
      po_vat: totalPoVat,
      po_gross: totalPoGross,
      invoiced_net: totalInvoiced,
      uninvoiced_net: totalUninvoiced
    });

    totalRow.font = { bold: true };

    /* =========================
       RESPONSE
       ========================= */
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="supplier-totals.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  }
);

module.exports = router;
