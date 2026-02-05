const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

/* ======================================================
   LOCATION SPREAD HELPERS
   ====================================================== */
async function getLocationBreakdownData(showSpreadLocations) {
  const [locations] = await db.query(`
    SELECT
      l.id,
      l.name,
      l.site_id,
      s.name AS site
    FROM locations l
    JOIN sites s ON s.id = l.site_id
    ORDER BY s.name, l.name
  `);

  const locationMap = new Map();
  const locationsBySite = new Map();

  locations.forEach(l => {
    locationMap.set(l.id, {
      id: l.id,
      name: l.name,
      site_id: l.site_id,
      site: l.site
    });

    if (!locationsBySite.has(l.site_id)) {
      locationsBySite.set(l.site_id, []);
    }
    locationsBySite.get(l.site_id).push(l.id);
  });

  const [locationTotals] = await db.query(`
    SELECT
      si.name AS site,
      si.id   AS site_id,
      l.id    AS location_id,
      l.name  AS location,

      COALESCE(SUM(po.net_amount), 0)        AS total_net,
      COALESCE(SUM(po.total_amount), 0)      AS total_gross,
      COALESCE(SUM(i.total_amount), 0)       AS total_invoiced

    FROM purchase_orders po
    JOIN sites si     ON si.id = po.site_id
    JOIN locations l  ON l.id  = po.location_id
    LEFT JOIN invoices i ON i.purchase_order_id = po.id

    WHERE po.status NOT IN ('cancelled', 'draft')

    GROUP BY si.name, si.id, l.id, l.name
    ORDER BY si.name, l.name
  `);

  const totalsMap = new Map();
  locationTotals.forEach(l => {
    totalsMap.set(l.location_id, {
      site: l.site,
      site_id: l.site_id,
      location: l.location,
      location_id: l.location_id,
      total_net: Number(l.total_net),
      total_gross: Number(l.total_gross),
      total_invoiced: Number(l.total_invoiced)
    });
  });

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

    WHERE po.status NOT IN ('cancelled', 'draft')

    GROUP BY l.id, ps.id, ps.name
    ORDER BY l.id, ps.name
  `);

  const stageMap = new Map();
  stages.forEach(s => {
    if (!stageMap.has(s.location_id)) {
      stageMap.set(s.location_id, new Map());
    }
    stageMap.get(s.location_id).set(s.stage, {
      stage: s.stage,
      net: Number(s.net_total),
      gross: Number(s.gross_total),
      invoiced: Number(s.invoiced_total)
    });
  });

  if (!showSpreadLocations) {
    const [rules] = await db.query(`
      SELECT id, source_location_id
      FROM location_spread_rules
    `);

    if (rules.length > 0) {
      // Track all source location IDs to prevent them from being targets
      const allSourceLocationIds = new Set(rules.map(r => r.source_location_id));

      const [ruleSites] = await db.query(`
        SELECT rs.id, rs.rule_id, rs.site_id, rs.spread_all
        FROM location_spread_rule_sites rs
      `);

      const ruleSiteIds = ruleSites.map(rs => rs.id);
      let ruleSiteLocations = [];

      if (ruleSiteIds.length > 0) {
        [ruleSiteLocations] = await db.query(`
          SELECT rsl.rule_site_id, rsl.location_id
          FROM location_spread_rule_locations rsl
          JOIN location_spread_rule_sites rs ON rs.id = rsl.rule_site_id
        `);
      }

      const ruleSitesByRule = new Map();
      ruleSites.forEach(rs => {
        if (!ruleSitesByRule.has(rs.rule_id)) {
          ruleSitesByRule.set(rs.rule_id, []);
        }
        ruleSitesByRule.get(rs.rule_id).push({
          id: rs.id,
          site_id: rs.site_id,
          spread_all: Number(rs.spread_all) === 1,
          locationIds: []
        });
      });

      ruleSiteLocations.forEach(loc => {
        const ruleSite = ruleSites.find(rs => rs.id === loc.rule_site_id);
        if (!ruleSite) return;
        const sites = ruleSitesByRule.get(ruleSite.rule_id) || [];
        const target = sites.find(s => s.id === ruleSite.id);
        if (target) target.locationIds.push(loc.location_id);
      });

      rules.forEach(rule => {
        const sourceId = rule.source_location_id;
        const sourceTotals = totalsMap.get(sourceId);
        if (!sourceTotals) return;

        const siteRules = ruleSitesByRule.get(rule.id) || [];
        let targets = [];

        siteRules.forEach(sr => {
          if (sr.spread_all) {
            const ids = locationsBySite.get(sr.site_id) || [];
            targets.push(...ids);
          } else {
            targets.push(...sr.locationIds);
          }
        });

        targets = [...new Set(targets)].filter(id => id && locationMap.has(id) && id !== sourceId);

        if (targets.length === 0) return;

        const shareNet = sourceTotals.total_net / targets.length;
        const shareGross = sourceTotals.total_gross / targets.length;
        const shareInvoiced = sourceTotals.total_invoiced / targets.length;

        targets.forEach(targetId => {
          // Skip if this target is itself a source location in another rule
          if (allSourceLocationIds.has(targetId)) {
            return;
          }

          if (!totalsMap.has(targetId)) {
            const info = locationMap.get(targetId);
            totalsMap.set(targetId, {
              site: info.site,
              site_id: info.site_id,
              location: info.name,
              location_id: info.id,
              total_net: 0,
              total_gross: 0,
              total_invoiced: 0
            });
          }

          const targetTotals = totalsMap.get(targetId);
          targetTotals.total_net += shareNet;
          targetTotals.total_gross += shareGross;
          targetTotals.total_invoiced += shareInvoiced;
        });

        const sourceStages = stageMap.get(sourceId) || new Map();
        sourceStages.forEach(stage => {
          const stageNet = stage.net / targets.length;
          const stageGross = stage.gross / targets.length;
          const stageInvoiced = stage.invoiced / targets.length;

          targets.forEach(targetId => {
            // Skip if this target is itself a source location in another rule
            if (allSourceLocationIds.has(targetId)) return;

            if (!stageMap.has(targetId)) {
              stageMap.set(targetId, new Map());
            }

            const targetStages = stageMap.get(targetId);
            if (!targetStages.has(stage.stage)) {
              targetStages.set(stage.stage, { stage: stage.stage, net: 0, gross: 0, invoiced: 0 });
            }

            const targetStage = targetStages.get(stage.stage);
            targetStage.net += stageNet;
            targetStage.gross += stageGross;
            targetStage.invoiced += stageInvoiced;
          });
        });

        totalsMap.delete(sourceId);
        stageMap.delete(sourceId);
      });
    }
  }

  const result = Array.from(totalsMap.values())
    .sort((a, b) => {
      if (a.site < b.site) return -1;
      if (a.site > b.site) return 1;
      return a.location.localeCompare(b.location);
    })
    .map(loc => ({
      site: loc.site,
      location: loc.location,
      location_id: loc.location_id,
      totals: {
        net: Number(loc.total_net),
        gross: Number(loc.total_gross),
        uninvoiced: Number(loc.total_gross) - Number(loc.total_invoiced)
      },
      stages: Array.from((stageMap.get(loc.location_id) || new Map()).values()).map(s => ({
        stage: s.stage,
        net: Number(s.net),
        gross: Number(s.gross),
        uninvoiced: Number(s.gross) - Number(s.invoiced)
      }))
    }));


  return result;
}





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

      WHERE po.status NOT IN ('cancelled', 'draft')

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
      const showSpreadLocations = req.query.showSpread === '1' || req.query.showSpread === 'true';
      const result = await getLocationBreakdownData(showSpreadLocations);
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
      const showSpreadLocations = req.query.showSpread === '1' || req.query.showSpread === 'true';
      const data = await getLocationBreakdownData(showSpreadLocations);

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
      WHERE po.status NOT IN ('cancelled', 'draft')
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

      WHERE po.status NOT IN ('cancelled', 'draft')
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
