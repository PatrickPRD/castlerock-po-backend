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
   PO TOTALS BY LOCATION → STAGE BREAKDOWN
   ====================================================== */
router.get(
  '/po-totals-by-location-breakdown',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      /* -------- Location totals -------- */
      const [locations] = await db.query(`
        SELECT
          si.name AS site,
          l.id    AS location_id,
          l.name  AS location,

          COALESCE(SUM(po.net_amount), 0)        AS total_net,
          COALESCE(SUM(po.total_amount), 0)      AS total_gross,
          COALESCE(SUM(i.total_amount), 0)       AS total_invoiced

        FROM purchase_orders po
        JOIN sites si     ON si.id = po.site_id
        JOIN locations l  ON l.id  = po.location_id
        LEFT JOIN invoices i ON i.purchase_order_id = po.id

        WHERE po.cancelled_at IS NULL

        GROUP BY si.name, l.id, l.name
        ORDER BY si.name, l.name
      `);

      /* -------- Stage breakdown -------- */
      const [stages] = await db.query(`
        SELECT
          l.id    AS location_id,
          ps.name AS stage,

          COALESCE(SUM(po.net_amount), 0)     AS net_total,
          COALESCE(SUM(po.total_amount), 0)   AS gross_total,
          COALESCE(SUM(i.total_amount), 0)    AS invoiced_total

        FROM purchase_orders po
        JOIN locations l   ON l.id = po.location_id
        JOIN po_stages ps  ON ps.id = po.stage_id
        LEFT JOIN invoices i ON i.purchase_order_id = po.id

        WHERE po.cancelled_at IS NULL

        GROUP BY l.id, ps.id, ps.name
        ORDER BY l.id, ps.name
      `);

      /* -------- Shape data -------- */
      const stageMap = {};
      stages.forEach(s => {
        if (!stageMap[s.location_id]) stageMap[s.location_id] = [];
        stageMap[s.location_id].push({
          stage: s.stage,
          net: Number(s.net_total),
          gross: Number(s.gross_total),
          uninvoiced: Number(s.gross_total) - Number(s.invoiced_total)
        });
      });

      const result = locations.map(l => ({
        site: l.site,
        location: l.location,
        totals: {
          net: Number(l.total_net),
          gross: Number(l.total_gross),
          uninvoiced: Number(l.total_gross) - Number(l.total_invoiced)
        },
        stages: stageMap[l.location_id] || []
      }));

      res.json(result);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load location breakdown report' });
    }
  }
);

/* ======================================================
   EXCEL — LOCATION → STAGE BREAKDOWN
   ====================================================== */
router.get(
  '/po-totals-by-location-breakdown.xlsx',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      /* -------- Location totals -------- */
      const [locations] = await db.query(`
        SELECT
          si.name AS site,
          l.id    AS location_id,
          l.name  AS location,

          COALESCE(SUM(po.net_amount), 0)        AS total_net,
          COALESCE(SUM(po.total_amount), 0)      AS total_gross,
          COALESCE(SUM(i.total_amount), 0)       AS total_invoiced

        FROM purchase_orders po
        JOIN sites si     ON si.id = po.site_id
        JOIN locations l  ON l.id  = po.location_id
        LEFT JOIN invoices i ON i.purchase_order_id = po.id

        WHERE po.cancelled_at IS NULL

        GROUP BY si.name, l.id, l.name
        ORDER BY si.name, l.name
      `);

      /* -------- Stage breakdown -------- */
      const [stages] = await db.query(`
        SELECT
          l.id    AS location_id,
          ps.name AS stage,

          COALESCE(SUM(po.net_amount), 0)     AS net_total,
          COALESCE(SUM(po.total_amount), 0)   AS gross_total,
          COALESCE(SUM(i.total_amount), 0)    AS invoiced_total

        FROM purchase_orders po
        JOIN locations l   ON l.id = po.location_id
        JOIN po_stages ps  ON ps.id = po.stage_id
        LEFT JOIN invoices i ON i.purchase_order_id = po.id

        WHERE po.cancelled_at IS NULL

        GROUP BY l.id, ps.id, ps.name
        ORDER BY l.id, ps.name
      `);

      /* -------- Shape data -------- */
      const stageMap = {};
      stages.forEach(s => {
        if (!stageMap[s.location_id]) stageMap[s.location_id] = [];
        stageMap[s.location_id].push({
          stage: s.stage,
          net: Number(s.net_total),
          gross: Number(s.gross_total),
          uninvoiced: Number(s.gross_total) - Number(s.invoiced_total)
        });
      });

      const data = locations.map(l => ({
        site: l.site,
        location: l.location,
        location_id: l.location_id,
        totals: {
          net: Number(l.total_net),
          gross: Number(l.total_gross),
          uninvoiced: Number(l.total_gross) - Number(l.total_invoiced)
        },
        stages: stageMap[l.location_id] || []
      }));

      /* -------- Group by site -------- */
      const sites = {};
      data.forEach(r => {
        if (!sites[r.site]) sites[r.site] = [];
        sites[r.site].push(r);
      });

      /* -------- Build Excel -------- */
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Castlerock Homes';

      for (const [siteName, rows] of Object.entries(sites)) {
        const sheet = workbook.addWorksheet(siteName.substring(0, 31));
        let rowCursor = 1;

        // Site title
        sheet.mergeCells(rowCursor, 1, rowCursor, 4);
        sheet.getCell(rowCursor, 1).value = siteName;
        sheet.getCell(rowCursor, 1).font = { size: 16, bold: true };
        rowCursor += 2;

        rows.forEach(loc => {
          // Location title
          sheet.mergeCells(rowCursor, 1, rowCursor, 4);
          sheet.getCell(rowCursor, 1).value = loc.location;
          sheet.getCell(rowCursor, 1).font = { size: 13, bold: true };
          rowCursor++;

// Build table rows from stages
const tableRows = loc.stages.map(s => ([
  s.stage,
  s.net,
  s.gross,
  s.uninvoiced
]));

// Create Excel table (with filters + totals)
sheet.addTable({
  name: `T_${siteName.replace(/\W/g, '')}_${loc.location_id}`,
  ref: `A${rowCursor}`,
  headerRow: true,
  totalsRow: true,
  style: {
    theme: 'TableStyleMedium9',
    showRowStripes: true
  },
  columns: [
    { name: 'Stage', totalsRowLabel: 'TOTAL' },
    { name: 'Net (€)', totalsRowFunction: 'sum' },
    { name: 'Gross (€)', totalsRowFunction: 'sum' },
    { name: 'Uninvoiced (€)', totalsRowFunction: 'sum' }
  ],
  rows: tableRows
});

// Currency formatting
['B', 'C', 'D'].forEach(col => {
  sheet.getColumn(col).numFmt = '€#,##0.00';
});

// Advance cursor: header + rows + totals + spacing
rowCursor += tableRows.length + 3;

        });

        // Formatting
        sheet.getColumn('A').width = 30;
        ['B', 'C', 'D'].forEach(col => {
          sheet.getColumn(col).numFmt = '€#,##0.00';
          sheet.getColumn(col).width = 18;
        });

        sheet.views = [{ state: 'frozen', ySplit: 2 }];
      }

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="po-location-stage-breakdown.xlsx"'
      );

      const buffer = await workbook.xlsx.writeBuffer();

res.setHeader(
  'Content-Type',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
);
res.setHeader(
  'Content-Disposition',
  'attachment; filename="po-location-stage-breakdown.xlsx"'
);

res.send(Buffer.from(buffer));


    } catch (err) {
      console.error('EXCEL EXPORT FAILED:', err);
      res.status(500).json({ error: 'Excel export failed' });
    }
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
