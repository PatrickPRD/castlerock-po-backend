const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const SettingsService = require('../services/settingsService');

/* ======================================================
   LOCATION SPREAD HELPERS
   ====================================================== */
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

async function getLocationBreakdownData(showSpreadLocations) {
  const [locations] = await db.query(`
    SELECT
      l.id,
      l.name,
      l.site_id,
      l.sale_price,
      l.floor_area,
      l.expected_spent,
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
      site: l.site,
      sale_price: Number(l.sale_price || 0),
      floor_area: l.floor_area ? Number(l.floor_area) : null,
      expected_spent: l.expected_spent != null ? Number(l.expected_spent) : null
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
      COALESCE(SUM(COALESCE(inv.invoiced_total, 0)), 0) AS total_invoiced

    FROM purchase_orders po
    JOIN locations l  ON l.id  = po.location_id
    JOIN sites si     ON si.id = l.site_id
    LEFT JOIN (
      SELECT purchase_order_id, SUM(total_amount) AS invoiced_total
      FROM invoices
      GROUP BY purchase_order_id
    ) inv ON inv.purchase_order_id = po.id

    WHERE po.status NOT IN ('cancelled', 'draft')

    GROUP BY si.name, si.id, l.id, l.name
    ORDER BY si.name, l.name
  `);

  const [labourTotals] = await db.query(`
    SELECT
      l.id AS location_id,
      COALESCE(SUM(COALESCE(w.weekly_cost, 0) / 5), 0) AS labour_cost
    FROM timesheet_entries te
    JOIN workers w ON w.id = te.worker_id
    JOIN locations l ON l.id = te.location_id
    WHERE (te.leave_type IS NULL OR te.leave_type IN ('paid_sick', 'annual_leave', 'bank_holiday'))
    GROUP BY l.id
  `);

  const labourMap = new Map();
  labourTotals.forEach(row => {
    labourMap.set(row.location_id, Number(row.labour_cost || 0));
  });

  // Capital costs spread evenly across all locations on each site
  const [capitalCosts] = await db.query(`
    SELECT site_id, COALESCE(SUM(cost), 0) AS total_capital_cost
    FROM site_capital_costs
    GROUP BY site_id
  `);

  const capitalCostPerLocation = new Map();
  capitalCosts.forEach(row => {
    const siteLocations = locationsBySite.get(row.site_id) || [];
    if (siteLocations.length === 0) return;
    const share = Number(row.total_capital_cost) / siteLocations.length;
    siteLocations.forEach(locId => {
      capitalCostPerLocation.set(locId, share);
    });
  });

  const totalsMap = new Map();
  locationTotals.forEach(l => {
    const info = locationMap.get(l.location_id);
    totalsMap.set(l.location_id, {
      site: l.site,
      site_id: l.site_id,
      location: l.location,
      location_id: l.location_id,
      total_net: Number(l.total_net),
      total_gross: Number(l.total_gross),
      total_invoiced: Number(l.total_invoiced),
      total_labour: labourMap.get(l.location_id) || 0,
      capital_cost: capitalCostPerLocation.get(l.location_id) || 0,
      sale_price: info ? info.sale_price : 0
    });
  });

  labourMap.forEach((labourCost, locationId) => {
    if (totalsMap.has(locationId)) return;
    const info = locationMap.get(locationId);
    if (!info) return;
    totalsMap.set(locationId, {
      site: info.site,
      site_id: info.site_id,
      location: info.name,
      location_id: info.id,
      total_net: 0,
      total_gross: 0,
      total_invoiced: 0,
      total_labour: labourCost,
      capital_cost: capitalCostPerLocation.get(locationId) || 0,
      sale_price: info.sale_price || 0
    });
  });

  const [stages] = await db.query(`
    SELECT
      l.id    AS location_id,
      ps.name AS stage,

      COALESCE(SUM(po.net_amount), 0)     AS net_total,
      COALESCE(SUM(po.total_amount), 0)   AS gross_total,
      COALESCE(SUM(COALESCE(inv.invoiced_total, 0)), 0) AS invoiced_total

    FROM purchase_orders po
    JOIN locations l   ON l.id = po.location_id
    JOIN po_stages ps  ON ps.id = po.stage_id
    LEFT JOIN (
      SELECT purchase_order_id, SUM(total_amount) AS invoiced_total
      FROM invoices
      GROUP BY purchase_order_id
    ) inv ON inv.purchase_order_id = po.id

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

        // Also filter out targets that are themselves sources (no chaining)
        const eligibleTargets = targets.filter(id => !allSourceLocationIds.has(id));

        if (eligibleTargets.length === 0) return;

        // --- Build floor-area-weighted shares ---
        // Separate targets into those with and without floor area
        const withArea = [];
        const withoutArea = [];
        eligibleTargets.forEach(id => {
          const info = locationMap.get(id);
          if (info && info.floor_area && info.floor_area > 0) {
            withArea.push({ id, area: info.floor_area });
          } else {
            withoutArea.push(id);
          }
        });

        // Compute per-target weight fraction
        const targetWeights = new Map();

        if (withArea.length === 0) {
          // No floor areas at all → equal distribution
          const equalWeight = 1 / eligibleTargets.length;
          eligibleTargets.forEach(id => targetWeights.set(id, equalWeight));
        } else if (withoutArea.length === 0) {
          // All have floor area → pure proportional
          const totalArea = withArea.reduce((sum, t) => sum + t.area, 0);
          withArea.forEach(t => targetWeights.set(t.id, t.area / totalArea));
        } else {
          // Mixed: treat unknowns as having the average floor area of known targets
          const avgArea = withArea.reduce((sum, t) => sum + t.area, 0) / withArea.length;
          const totalArea = withArea.reduce((sum, t) => sum + t.area, 0) + (avgArea * withoutArea.length);
          withArea.forEach(t => targetWeights.set(t.id, t.area / totalArea));
          withoutArea.forEach(id => targetWeights.set(id, avgArea / totalArea));
        }

        eligibleTargets.forEach(targetId => {
          const weight = targetWeights.get(targetId);

          if (!totalsMap.has(targetId)) {
            const info = locationMap.get(targetId);
            totalsMap.set(targetId, {
              site: info.site,
              site_id: info.site_id,
              location: info.name,
              location_id: info.id,
              total_net: 0,
              total_gross: 0,
              total_invoiced: 0,
              total_labour: 0,
              capital_cost: 0,
              sale_price: info.sale_price || 0
            });
          }

          const targetTotals = totalsMap.get(targetId);
          targetTotals.total_net += sourceTotals.total_net * weight;
          targetTotals.total_gross += sourceTotals.total_gross * weight;
          targetTotals.total_invoiced += sourceTotals.total_invoiced * weight;
          targetTotals.total_labour += (sourceTotals.total_labour || 0) * weight;
          targetTotals.capital_cost += (sourceTotals.capital_cost || 0) * weight;
        });

        const sourceStages = stageMap.get(sourceId) || new Map();
        sourceStages.forEach(stage => {
          eligibleTargets.forEach(targetId => {
            const weight = targetWeights.get(targetId);

            if (!stageMap.has(targetId)) {
              stageMap.set(targetId, new Map());
            }

            const targetStages = stageMap.get(targetId);
            if (!targetStages.has(stage.stage)) {
              targetStages.set(stage.stage, { stage: stage.stage, net: 0, gross: 0, invoiced: 0 });
            }

            const targetStage = targetStages.get(stage.stage);
            targetStage.net += stage.net * weight;
            targetStage.gross += stage.gross * weight;
            targetStage.invoiced += stage.invoiced * weight;
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
    .map(loc => {
      const info = locationMap.get(loc.location_id);
      return {
      site: loc.site,
      location: loc.location,
      location_id: loc.location_id,
      sale_price: Number(loc.sale_price || 0),
      expected_spent: info ? info.expected_spent : null,
      totals: {
        net: Number(loc.total_net),
        gross: Number(loc.total_gross),
        uninvoiced: Number(loc.total_gross) - Number(loc.total_invoiced),
        labour: Number(loc.total_labour || 0),
        capital_cost: Number(loc.capital_cost || 0)
      },
      stages: Array.from((stageMap.get(loc.location_id) || new Map()).values()).map(s => ({
        stage: s.stage,
        net: Number(s.net),
        gross: Number(s.gross),
        uninvoiced: Number(s.gross) - Number(s.invoiced)
      }))
    };
    });


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
        COALESCE(SUM(COALESCE(inv.vat_amount, 0)), 0) AS total_vat,

        -- Invoice gross
        COALESCE(SUM(COALESCE(inv.invoiced_total, 0)), 0) AS total_gross,

        -- Uninvoiced (ex VAT only)
        COALESCE(SUM(po.net_amount), 0)
          - COALESCE(SUM(COALESCE(inv.invoiced_net, 0)), 0)
          AS uninvoiced_total

      FROM purchase_orders po
      JOIN sites si ON po.site_id = si.id
      JOIN locations l ON po.location_id = l.id

      LEFT JOIN (
        SELECT purchase_order_id,
               SUM(net_amount) AS invoiced_net,
               SUM(vat_amount) AS vat_amount,
               SUM(total_amount) AS invoiced_total
        FROM invoices
        GROUP BY purchase_order_id
      ) inv ON inv.purchase_order_id = po.id

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
   EXCEL — LOCATION → STAGE BREAKDOWN (Presentation-Ready)
   ====================================================== */
router.get(
  '/po-totals-by-location-breakdown.xlsx',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const showSpreadLocations = req.query.showSpread === '1' || req.query.showSpread === 'true';
      const data = await getLocationBreakdownData(showSpreadLocations);

      /* -------- Load financial settings -------- */
      const settings = await SettingsService.getSettings();
      const currencyCode = settings.currency_code || 'EUR';
      const currencySymbol = { EUR: '€', GBP: '£', USD: '$' }[currencyCode] || '€';
      const vatRates = settings.vat_rates ? JSON.parse(settings.vat_rates) : [0, 13.5, 23];
      const vatOnSale = Number.isFinite(Number(settings.vat_on_sale))
        ? Number(settings.vat_on_sale)
        : (vatRates.length > 0 ? Math.max(...vatRates) : 23);
      const solicitorPct = Number.isFinite(Number(settings.solicitor_pct))
        ? Number(settings.solicitor_pct) : 1;
      const auctioneerPct = Number.isFinite(Number(settings.auctioneer_pct))
        ? Number(settings.auctioneer_pct) : 1;
      const vatRate = vatOnSale / 100;

      /* -------- Profit/Loss helper -------- */
      function calcProfitLoss(r) {
        const salePrice = Number(r.sale_price || 0);
        const salePriceExVat = salePrice / (1 + vatRate);
        const solicitorCost = salePrice * (solicitorPct / 100);
        const auctioneerCost = salePrice * (auctioneerPct / 100);
        const capitalCost = Number(r.totals.capital_cost || 0);
        const netSpendIncLabour = Number(r.totals.net) + Number(r.totals.labour || 0);
        return salePriceExVat - netSpendIncLabour - capitalCost - solicitorCost - auctioneerCost;
      }

      function calcTargetProfit(r) {
        if (r.expected_spent == null) return null;
        const salePrice = Number(r.sale_price || 0);
        const salePriceExVat = salePrice / (1 + vatRate);
        const solicitorCost = salePrice * (solicitorPct / 100);
        const auctioneerCost = salePrice * (auctioneerPct / 100);
        const capitalCost = Number(r.totals.capital_cost || 0);
        const expectedSpent = Number(r.expected_spent);
        return salePriceExVat - expectedSpent - capitalCost - solicitorCost - auctioneerCost;
      }

      /* -------- Group by site -------- */
      const sites = {};
      data.forEach(r => {
        if (!sites[r.site]) sites[r.site] = [];
        sites[r.site].push(r);
      });

      /* -------- Style constants -------- */
      const currFmt = `${currencySymbol}#,##0.00`;
      const pctFmt = '0.0%';
      const brandColor = '1B4F72';
      const brandColorLight = 'D6EAF8';
      const profitGreenBg = 'E8F5E9';
      const profitGreenFont = '2E7D32';
      const lossRedBg = 'FFEBEE';
      const lossRedFont = 'C62828';
      const lightGrayBg = 'F5F5F5';
      const borderStyle = { style: 'thin', color: { argb: 'FFBDBDBD' } };

      const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + brandColor } };
      const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      const headerAlignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      function applyBorder(cell) {
        cell.border = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };
      }

      function applyCurrencyCell(cell, value) {
        cell.value = value;
        cell.numFmt = currFmt;
        cell.alignment = { horizontal: 'right' };
        applyBorder(cell);
      }

      function applyProfitStyle(cell, value) {
        cell.value = value;
        cell.numFmt = currFmt;
        cell.alignment = { horizontal: 'right' };
        applyBorder(cell);
        if (value >= 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + profitGreenBg } };
          cell.font = { bold: true, color: { argb: 'FF' + profitGreenFont } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + lossRedBg } };
          cell.font = { bold: true, color: { argb: 'FF' + lossRedFont } };
        }
      }

      function applyPctStyle(cell, value) {
        cell.value = value;
        cell.numFmt = pctFmt;
        cell.alignment = { horizontal: 'right' };
        applyBorder(cell);
        if (value >= 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + profitGreenBg } };
          cell.font = { bold: true, color: { argb: 'FF' + profitGreenFont } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + lossRedBg } };
          cell.font = { bold: true, color: { argb: 'FF' + lossRedFont } };
        }
      }

      /* -------- Build Excel -------- */
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Castlerock Homes';
      workbook.created = new Date();

      /* ========== SUMMARY SHEET ========== */
      const summary = workbook.addWorksheet('Summary', {
        properties: { tabColor: { argb: 'FF' + brandColor } }
      });

      // Title row
      summary.mergeCells('A1:N1');
      const titleCell = summary.getCell('A1');
      titleCell.value = 'Location Report — Profit & Loss Summary';
      titleCell.font = { size: 16, bold: true, color: { argb: 'FF' + brandColor } };
      titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
      summary.getRow(1).height = 30;

      // Subtitle with settings
      summary.mergeCells('A2:N2');
      const subtitleCell = summary.getCell('A2');
      subtitleCell.value = `Generated: ${new Date().toLocaleDateString('en-GB')}  |  VAT on Sale: ${vatOnSale}%  |  Solicitor: ${solicitorPct}%  |  Auctioneer: ${auctioneerPct}%`;
      subtitleCell.font = { size: 10, italic: true, color: { argb: 'FF757575' } };
      subtitleCell.alignment = { horizontal: 'left' };

      // Summary headers (row 4)
      const summaryHeaders = [
        'Site', 'Location', `Total Net (${currencySymbol})`, `Labour (${currencySymbol})`,
        `Capital Cost (${currencySymbol})`, `Sale Price (${currencySymbol})`,
        `Sale Price ex VAT (${currencySymbol})`, `Solicitor (${currencySymbol})`,
        `Auctioneer (${currencySymbol})`, `Expected Spent (${currencySymbol})`,
        `Target Profit (${currencySymbol})`, 'Target %',
        `Actual Profit (${currencySymbol})`, 'Actual %'
      ];
      const summaryHeaderRow = summary.getRow(4);
      summaryHeaderRow.height = 28;
      summaryHeaders.forEach((h, i) => {
        const cell = summaryHeaderRow.getCell(i + 1);
        cell.value = h;
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = headerAlignment;
        applyBorder(cell);
      });

      // Summary data rows
      let summaryRowIdx = 5;
      let grandTotalNet = 0, grandTotalLabour = 0, grandTotalCapital = 0;
      let grandTotalSales = 0, grandTotalSalesExVat = 0;
      let grandTotalSolicitor = 0, grandTotalAuctioneer = 0;
      let grandTotalExpectedSpent = 0, grandTotalTargetPL = 0, grandTotalPL = 0;

      data.forEach((r, idx) => {
        const salePrice = Number(r.sale_price || 0);
        const salePriceExVat = salePrice / (1 + vatRate);
        const totalNet = Number(r.totals.net) + Number(r.totals.labour || 0);
        const labour = Number(r.totals.labour || 0);
        const capitalCost = Number(r.totals.capital_cost || 0);
        const solicitorCost = salePrice * (solicitorPct / 100);
        const auctioneerCost = salePrice * (auctioneerPct / 100);
        const expectedSpent = r.expected_spent != null ? Number(r.expected_spent) : null;
        const targetProfit = calcTargetProfit(r);
        const targetPctVal = targetProfit != null && salePriceExVat > 0 ? targetProfit / salePriceExVat : null;
        const profitLoss = calcProfitLoss(r);
        const profitPctVal = salePriceExVat > 0 ? profitLoss / salePriceExVat : 0;

        grandTotalNet += totalNet;
        grandTotalLabour += labour;
        grandTotalCapital += capitalCost;
        grandTotalSales += salePrice;
        grandTotalSalesExVat += salePriceExVat;
        grandTotalSolicitor += solicitorCost;
        grandTotalAuctioneer += auctioneerCost;
        if (expectedSpent != null) grandTotalExpectedSpent += expectedSpent;
        if (targetProfit != null) grandTotalTargetPL += targetProfit;
        grandTotalPL += profitLoss;

        const row = summary.getRow(summaryRowIdx);
        const isAlt = idx % 2 === 1;
        const altFill = isAlt
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + lightGrayBg } }
          : undefined;

        // Site
        const siteCell = row.getCell(1);
        siteCell.value = r.site;
        siteCell.alignment = { horizontal: 'left' };
        applyBorder(siteCell);
        if (altFill) siteCell.fill = altFill;

        // Location
        const locCell = row.getCell(2);
        locCell.value = r.location;
        locCell.alignment = { horizontal: 'left' };
        applyBorder(locCell);
        if (altFill) locCell.fill = altFill;

        // Total Net
        applyCurrencyCell(row.getCell(3), totalNet);
        if (altFill) row.getCell(3).fill = altFill;

        // Labour
        applyCurrencyCell(row.getCell(4), labour);
        if (altFill) row.getCell(4).fill = altFill;

        // Capital Cost
        applyCurrencyCell(row.getCell(5), capitalCost);
        if (altFill) row.getCell(5).fill = altFill;

        // Sale Price
        applyCurrencyCell(row.getCell(6), salePrice);
        if (altFill) row.getCell(6).fill = altFill;

        // Sale Price ex VAT
        applyCurrencyCell(row.getCell(7), salePriceExVat);
        if (altFill) row.getCell(7).fill = altFill;

        // Solicitor
        applyCurrencyCell(row.getCell(8), solicitorCost);
        if (altFill) row.getCell(8).fill = altFill;

        // Auctioneer
        applyCurrencyCell(row.getCell(9), auctioneerCost);
        if (altFill) row.getCell(9).fill = altFill;

        // Expected Spent
        const esCell = row.getCell(10);
        if (expectedSpent != null) {
          applyCurrencyCell(esCell, expectedSpent);
        } else {
          esCell.value = '';
          applyBorder(esCell);
        }
        if (altFill) esCell.fill = altFill;

        // Target Profit
        if (targetProfit != null) {
          applyProfitStyle(row.getCell(11), targetProfit);
        } else {
          row.getCell(11).value = '';
          applyBorder(row.getCell(11));
          if (altFill) row.getCell(11).fill = altFill;
        }

        // Target %
        if (targetPctVal != null) {
          applyPctStyle(row.getCell(12), targetPctVal);
        } else {
          row.getCell(12).value = '';
          applyBorder(row.getCell(12));
          if (altFill) row.getCell(12).fill = altFill;
        }

        // Actual Profit/Loss
        applyProfitStyle(row.getCell(13), profitLoss);

        // Actual Profit %
        applyPctStyle(row.getCell(14), profitPctVal);

        summaryRowIdx++;
      });

      // Summary totals row
      const totalRowIdx = summaryRowIdx;
      const totalsRow = summary.getRow(totalRowIdx);
      totalsRow.height = 24;
      const totalsFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + brandColor } };
      const totalsFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

      const totalsLabelCell = totalsRow.getCell(1);
      totalsLabelCell.value = 'TOTAL';
      totalsLabelCell.fill = totalsFill;
      totalsLabelCell.font = totalsFont;
      totalsLabelCell.alignment = { horizontal: 'left' };
      applyBorder(totalsLabelCell);

      totalsRow.getCell(2).value = `${data.length} locations`;
      totalsRow.getCell(2).fill = totalsFill;
      totalsRow.getCell(2).font = totalsFont;
      applyBorder(totalsRow.getCell(2));

      const grandTotals = [
        grandTotalNet, grandTotalLabour, grandTotalCapital,
        grandTotalSales, grandTotalSalesExVat,
        grandTotalSolicitor, grandTotalAuctioneer
      ];
      grandTotals.forEach((val, i) => {
        const cell = totalsRow.getCell(i + 3);
        cell.value = val;
        cell.numFmt = currFmt;
        cell.fill = totalsFill;
        cell.font = totalsFont;
        cell.alignment = { horizontal: 'right' };
        applyBorder(cell);
      });

      // Grand total Expected Spent
      const grandESCell = totalsRow.getCell(10);
      grandESCell.value = grandTotalExpectedSpent;
      grandESCell.numFmt = currFmt;
      grandESCell.fill = totalsFill;
      grandESCell.font = totalsFont;
      grandESCell.alignment = { horizontal: 'right' };
      applyBorder(grandESCell);

      // Grand total Target P/L
      const grandTPLCell = totalsRow.getCell(11);
      grandTPLCell.value = grandTotalTargetPL;
      grandTPLCell.numFmt = currFmt;
      grandTPLCell.font = { bold: true, color: { argb: grandTotalTargetPL >= 0 ? 'FF' + profitGreenFont : 'FF' + lossRedFont }, size: 11 };
      grandTPLCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalTargetPL >= 0 ? 'FF' + profitGreenBg : 'FF' + lossRedBg } };
      applyBorder(grandTPLCell);

      // Grand avg target %
      const locationsWithTarget = data.filter(r => r.expected_spent != null);
      const grandAvgTargetPct = locationsWithTarget.length > 0
        ? locationsWithTarget.reduce((sum, r) => {
            const sp = Number(r.sale_price || 0) / (1 + vatRate);
            const tp = calcTargetProfit(r);
            return sum + (sp > 0 && tp != null ? tp / sp : 0);
          }, 0) / locationsWithTarget.length
        : 0;
      const grandTPctCell = totalsRow.getCell(12);
      grandTPctCell.value = grandAvgTargetPct;
      grandTPctCell.numFmt = pctFmt;
      grandTPctCell.font = { bold: true, color: { argb: grandAvgTargetPct >= 0 ? 'FF' + profitGreenFont : 'FF' + lossRedFont }, size: 11 };
      grandTPctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandAvgTargetPct >= 0 ? 'FF' + profitGreenBg : 'FF' + lossRedBg } };
      applyBorder(grandTPctCell);

      // Grand total Actual P/L
      const grandPLCell = totalsRow.getCell(13);
      grandPLCell.value = grandTotalPL;
      grandPLCell.numFmt = currFmt;
      grandPLCell.font = { bold: true, color: { argb: grandTotalPL >= 0 ? 'FF' + profitGreenFont : 'FF' + lossRedFont }, size: 11 };
      grandPLCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandTotalPL >= 0 ? 'FF' + profitGreenBg : 'FF' + lossRedBg } };
      applyBorder(grandPLCell);

      // Grand avg profit %
      const grandAvgPct = data.length > 0
        ? data.reduce((sum, r) => {
            const sp = Number(r.sale_price || 0) / (1 + vatRate);
            return sum + (sp > 0 ? calcProfitLoss(r) / sp : 0);
          }, 0) / data.length
        : 0;
      const grandPctCell = totalsRow.getCell(14);
      grandPctCell.value = grandAvgPct;
      grandPctCell.numFmt = pctFmt;
      grandPctCell.font = { bold: true, color: { argb: grandAvgPct >= 0 ? 'FF' + profitGreenFont : 'FF' + lossRedFont }, size: 11 };
      grandPctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grandAvgPct >= 0 ? 'FF' + profitGreenBg : 'FF' + lossRedBg } };
      applyBorder(grandPctCell);

      // Summary column widths
      summary.getColumn(1).width = 22;
      summary.getColumn(2).width = 22;
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 13].forEach(c => { summary.getColumn(c).width = 18; });
      summary.getColumn(12).width = 12;
      summary.getColumn(14).width = 12;
      summary.views = [{ state: 'frozen', ySplit: 4, xSplit: 2 }];

      /* ========== PER-SITE DETAIL SHEETS ========== */
      for (const [siteName, rows] of Object.entries(sites)) {
        const sheetName = siteName.length > 28 ? siteName.substring(0, 28) + '...' : siteName;
        const sheet = workbook.addWorksheet(sheetName);
        let rowCursor = 1;

        // Site title
        sheet.mergeCells(rowCursor, 1, rowCursor, 9);
        const siteTitleCell = sheet.getCell(rowCursor, 1);
        siteTitleCell.value = siteName;
        siteTitleCell.font = { size: 16, bold: true, color: { argb: 'FF' + brandColor } };
        siteTitleCell.alignment = { vertical: 'middle' };
        sheet.getRow(rowCursor).height = 28;
        rowCursor++;

        // Site subtitle
        sheet.mergeCells(rowCursor, 1, rowCursor, 9);
        sheet.getCell(rowCursor, 1).value = `${rows.length} locations  |  Generated: ${new Date().toLocaleDateString('en-GB')}`;
        sheet.getCell(rowCursor, 1).font = { size: 10, italic: true, color: { argb: 'FF757575' } };
        rowCursor += 2;

        // Site overview table header
        const overviewHeaders = [
          'Location', `Total Net (${currencySymbol})`, `Labour (${currencySymbol})`,
          `Sale Price (${currencySymbol})`, `Expected Spent (${currencySymbol})`,
          `Target Profit (${currencySymbol})`, 'Target %',
          `Actual Profit (${currencySymbol})`, 'Actual %'
        ];
        const ohRow = sheet.getRow(rowCursor);
        ohRow.height = 24;
        overviewHeaders.forEach((h, i) => {
          const cell = ohRow.getCell(i + 1);
          cell.value = h;
          cell.fill = headerFill;
          cell.font = headerFont;
          cell.alignment = headerAlignment;
          applyBorder(cell);
        });
        rowCursor++;

        // Site overview data rows
        let siteTotalNet = 0, siteTotalSales = 0, siteTotalTargetPL = 0, siteTotalPL = 0;
        rows.forEach((loc, idx) => {
          const totalNet = Number(loc.totals.net) + Number(loc.totals.labour || 0);
          const labour = Number(loc.totals.labour || 0);
          const salePrice = Number(loc.sale_price || 0);
          const expectedSpent = loc.expected_spent != null ? Number(loc.expected_spent) : null;
          const targetProfit = calcTargetProfit(loc);
          const profitLoss = calcProfitLoss(loc);
          const salePriceExVat = salePrice / (1 + vatRate);
          const targetPctVal = targetProfit != null && salePriceExVat > 0 ? targetProfit / salePriceExVat : null;
          const profitPctVal = salePriceExVat > 0 ? profitLoss / salePriceExVat : 0;

          siteTotalNet += totalNet;
          siteTotalSales += salePrice;
          if (targetProfit != null) siteTotalTargetPL += targetProfit;
          siteTotalPL += profitLoss;

          const row = sheet.getRow(rowCursor);
          const isAlt = idx % 2 === 1;
          const altFill = isAlt
            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + lightGrayBg } }
            : undefined;

          const locCell = row.getCell(1);
          locCell.value = loc.location;
          locCell.font = { bold: true };
          locCell.alignment = { horizontal: 'left' };
          applyBorder(locCell);
          if (altFill) locCell.fill = altFill;

          applyCurrencyCell(row.getCell(2), totalNet);
          if (altFill) row.getCell(2).fill = altFill;

          applyCurrencyCell(row.getCell(3), labour);
          if (altFill) row.getCell(3).fill = altFill;

          applyCurrencyCell(row.getCell(4), salePrice);
          if (altFill) row.getCell(4).fill = altFill;

          // Expected Spent
          const esCell2 = row.getCell(5);
          if (expectedSpent != null) {
            applyCurrencyCell(esCell2, expectedSpent);
          } else {
            esCell2.value = '';
            applyBorder(esCell2);
          }
          if (altFill) esCell2.fill = altFill;

          // Target Profit
          if (targetProfit != null) {
            applyProfitStyle(row.getCell(6), targetProfit);
          } else {
            row.getCell(6).value = '';
            applyBorder(row.getCell(6));
            if (altFill) row.getCell(6).fill = altFill;
          }

          // Target %
          if (targetPctVal != null) {
            applyPctStyle(row.getCell(7), targetPctVal);
          } else {
            row.getCell(7).value = '';
            applyBorder(row.getCell(7));
            if (altFill) row.getCell(7).fill = altFill;
          }

          applyProfitStyle(row.getCell(8), profitLoss);
          applyPctStyle(row.getCell(9), profitPctVal);

          rowCursor++;
        });

        // Site totals row
        const siteTotal = sheet.getRow(rowCursor);
        siteTotal.height = 24;
        const stCell = siteTotal.getCell(1);
        stCell.value = 'SITE TOTAL';
        stCell.fill = totalsFill;
        stCell.font = totalsFont;
        applyBorder(stCell);

        const stNetCell = siteTotal.getCell(2);
        stNetCell.value = siteTotalNet;
        stNetCell.numFmt = currFmt;
        stNetCell.fill = totalsFill;
        stNetCell.font = totalsFont;
        stNetCell.alignment = { horizontal: 'right' };
        applyBorder(stNetCell);

        siteTotal.getCell(3).fill = totalsFill;
        applyBorder(siteTotal.getCell(3));

        const stSalesCell = siteTotal.getCell(4);
        stSalesCell.value = siteTotalSales;
        stSalesCell.numFmt = currFmt;
        stSalesCell.fill = totalsFill;
        stSalesCell.font = totalsFont;
        stSalesCell.alignment = { horizontal: 'right' };
        applyBorder(stSalesCell);

        // Expected Spent total (blank)
        siteTotal.getCell(5).fill = totalsFill;
        applyBorder(siteTotal.getCell(5));

        // Target Profit total
        const stTPLCell = siteTotal.getCell(6);
        stTPLCell.value = siteTotalTargetPL;
        stTPLCell.numFmt = currFmt;
        stTPLCell.font = { bold: true, color: { argb: siteTotalTargetPL >= 0 ? 'FF' + profitGreenFont : 'FF' + lossRedFont }, size: 11 };
        stTPLCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: siteTotalTargetPL >= 0 ? 'FF' + profitGreenBg : 'FF' + lossRedBg } };
        applyBorder(stTPLCell);

        // Target % (blank for total)
        siteTotal.getCell(7).fill = totalsFill;
        applyBorder(siteTotal.getCell(7));

        const stPLCell = siteTotal.getCell(8);
        stPLCell.value = siteTotalPL;
        stPLCell.numFmt = currFmt;
        stPLCell.font = { bold: true, color: { argb: siteTotalPL >= 0 ? 'FF' + profitGreenFont : 'FF' + lossRedFont }, size: 11 };
        stPLCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: siteTotalPL >= 0 ? 'FF' + profitGreenBg : 'FF' + lossRedBg } };
        applyBorder(stPLCell);

        siteTotal.getCell(9).fill = totalsFill;
        applyBorder(siteTotal.getCell(9));

        rowCursor += 3;

        // Detailed breakdowns per location
        rows.forEach(loc => {
          const salePrice = Number(loc.sale_price || 0);
          const salePriceExVat = salePrice / (1 + vatRate);
          const labour = Number(loc.totals.labour || 0);
          const capitalCost = Number(loc.totals.capital_cost || 0);
          const solicitorCost = salePrice * (solicitorPct / 100);
          const auctioneerCost = salePrice * (auctioneerPct / 100);
          const expectedSpent = loc.expected_spent != null ? Number(loc.expected_spent) : null;
          const targetProfit = calcTargetProfit(loc);
          const profitLoss = calcProfitLoss(loc);
          const targetPctVal = targetProfit != null && salePriceExVat > 0 ? targetProfit / salePriceExVat : null;
          const profitPctVal = salePriceExVat > 0 ? profitLoss / salePriceExVat : 0;

          // Location header
          sheet.mergeCells(rowCursor, 1, rowCursor, 4);
          const locTitle = sheet.getCell(rowCursor, 1);
          locTitle.value = loc.location;
          locTitle.font = { size: 13, bold: true, color: { argb: 'FF' + brandColor } };
          locTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + brandColorLight } };
          locTitle.alignment = { vertical: 'middle' };
          locTitle.border = { bottom: { style: 'medium', color: { argb: 'FF' + brandColor } } };
          [2, 3, 4].forEach(c => {
            sheet.getCell(rowCursor, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + brandColorLight } };
            sheet.getCell(rowCursor, c).border = { bottom: { style: 'medium', color: { argb: 'FF' + brandColor } } };
          });
          sheet.getRow(rowCursor).height = 24;
          rowCursor++;

          // Stage breakdown header
          const stgHdrRow = sheet.getRow(rowCursor);
          ['Stage', `Net (${currencySymbol})`, `Gross (${currencySymbol})`].forEach((h, i) => {
            const cell = stgHdrRow.getCell(i + 1);
            cell.value = h;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
            cell.font = { bold: true, size: 10 };
            cell.alignment = { horizontal: i === 0 ? 'left' : 'center' };
            applyBorder(cell);
          });
          rowCursor++;

          // Stage rows
          loc.stages.forEach(s => {
            const stgRow = sheet.getRow(rowCursor);
            const stgCell = stgRow.getCell(1);
            stgCell.value = s.stage;
            stgCell.alignment = { horizontal: 'left' };
            applyBorder(stgCell);
            applyCurrencyCell(stgRow.getCell(2), s.net);
            applyCurrencyCell(stgRow.getCell(3), s.gross);
            rowCursor++;
          });

          // Stage totals
          const stgTotalRow = sheet.getRow(rowCursor);
          const stgTotalLabel = stgTotalRow.getCell(1);
          stgTotalLabel.value = 'Stage Total';
          stgTotalLabel.font = { bold: true };
          stgTotalLabel.alignment = { horizontal: 'left' };
          applyBorder(stgTotalLabel);
          const stgNetTotal = loc.stages.reduce((s, st) => s + st.net, 0);
          const stgGrossTotal = loc.stages.reduce((s, st) => s + st.gross, 0);
          applyCurrencyCell(stgTotalRow.getCell(2), stgNetTotal);
          stgTotalRow.getCell(2).font = { bold: true };
          applyCurrencyCell(stgTotalRow.getCell(3), stgGrossTotal);
          stgTotalRow.getCell(3).font = { bold: true };
          rowCursor += 2;

          // Profit/Loss breakdown section
          const plTitle = sheet.getRow(rowCursor);
          sheet.mergeCells(rowCursor, 1, rowCursor, 2);
          plTitle.getCell(1).value = 'Profit & Loss Breakdown';
          plTitle.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF' + brandColor } };
          plTitle.getCell(1).border = { bottom: { style: 'thin', color: { argb: 'FF' + brandColor } } };
          plTitle.getCell(2).border = { bottom: { style: 'thin', color: { argb: 'FF' + brandColor } } };
          rowCursor++;

          const plItems = [
            ['Total Net (inc. Labour)', Number(loc.totals.net) + labour],
            ['Labour Cost', labour],
            ['Capital Cost', capitalCost],
            ['Sale Price', salePrice],
            ['Sale Price (ex VAT)', salePriceExVat],
            [`Solicitor (${solicitorPct}%)`, solicitorCost],
            [`Auctioneer (${auctioneerPct}%)`, auctioneerCost]
          ];

          if (expectedSpent != null) {
            plItems.push(['Expected Spent', expectedSpent]);
          }

          plItems.forEach(([label, val]) => {
            const plRow = sheet.getRow(rowCursor);
            const plLabel = plRow.getCell(1);
            plLabel.value = label;
            plLabel.alignment = { horizontal: 'left' };
            plLabel.font = { size: 10 };
            applyBorder(plLabel);
            applyCurrencyCell(plRow.getCell(2), val);
            rowCursor++;
          });

          // Profit/Loss result
          const plResultRow = sheet.getRow(rowCursor);
          const plResultLabel = plResultRow.getCell(1);
          plResultLabel.value = 'Actual Profit / Loss';
          plResultLabel.font = { bold: true, size: 11 };
          plResultLabel.alignment = { horizontal: 'left' };
          applyBorder(plResultLabel);
          applyProfitStyle(plResultRow.getCell(2), profitLoss);

          rowCursor++;

          // Profit % row
          const pctResultRow = sheet.getRow(rowCursor);
          const pctResultLabel = pctResultRow.getCell(1);
          pctResultLabel.value = 'Actual Profit %';
          pctResultLabel.font = { bold: true, size: 11 };
          pctResultLabel.alignment = { horizontal: 'left' };
          applyBorder(pctResultLabel);
          applyPctStyle(pctResultRow.getCell(2), profitPctVal);

          rowCursor++;

          // Target Profit row (if available)
          if (targetProfit != null) {
            const tpResultRow = sheet.getRow(rowCursor);
            const tpResultLabel = tpResultRow.getCell(1);
            tpResultLabel.value = 'Target Profit / Loss';
            tpResultLabel.font = { bold: true, size: 11 };
            tpResultLabel.alignment = { horizontal: 'left' };
            applyBorder(tpResultLabel);
            applyProfitStyle(tpResultRow.getCell(2), targetProfit);

            rowCursor++;

            const tpPctRow = sheet.getRow(rowCursor);
            const tpPctLabel = tpPctRow.getCell(1);
            tpPctLabel.value = 'Target Profit %';
            tpPctLabel.font = { bold: true, size: 11 };
            tpPctLabel.alignment = { horizontal: 'left' };
            applyBorder(tpPctLabel);
            applyPctStyle(tpPctRow.getCell(2), targetPctVal);

            rowCursor++;
          }

          rowCursor += 3;
        });

        // Column widths
        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 20;
        sheet.getColumn(3).width = 20;
        sheet.getColumn(4).width = 20;
        sheet.getColumn(5).width = 20;
        sheet.getColumn(6).width = 20;
        sheet.getColumn(7).width = 14;
        sheet.getColumn(8).width = 20;
        sheet.getColumn(9).width = 14;

        sheet.views = [{ state: 'frozen', ySplit: 4 }];
      }

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="location-report.xlsx"'
      );

      const buffer = await workbook.xlsx.writeBuffer();
      res.send(Buffer.from(buffer));

    } catch (err) {
      console.error('EXCEL EXPORT FAILED:', err);
      res.status(500).json({ error: 'Excel export failed' });
    }
  }
);

/* ======================================================
   LABOUR COSTS REPORT
   ====================================================== */
router.get(
  '/labour-costs',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    const siteId = String(req.query.siteId || '').trim();
    const workerId = String(req.query.workerId || '').trim();
    const params = ['paid_sick', 'annual_leave', 'bank_holiday'];
    const filters = ['(te.leave_type IS NULL OR te.leave_type IN (?, ?, ?))'];

    if (siteId) {
      filters.push('s.id = ?');
      params.push(siteId);
    }

    if (workerId) {
      filters.push('te.worker_id = ?');
      params.push(workerId);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    try {
      const [rows] = await db.query(
        `
        SELECT
          s.id AS site_id,
          s.name AS site,
          l.id AS location_id,
          l.name AS location,
          SUM(COALESCE(w.weekly_cost, 0) / 5) AS labour_cost,
          COUNT(*) AS days_worked,
          DATE_FORMAT(MIN(te.work_date), '%Y-%m-%d') AS start_date,
          DATE_FORMAT(MAX(te.work_date), '%Y-%m-%d') AS end_date
        FROM timesheet_entries te
        JOIN workers w ON w.id = te.worker_id
        JOIN sites s ON s.id = te.site_id
        JOIN locations l ON l.id = te.location_id
        ${whereClause}
        GROUP BY s.id, s.name, l.id, l.name
        HAVING labour_cost > 0
        ORDER BY s.name, l.name
        `,
        params
      );

      res.json(rows.map(row => ({
        site_id: row.site_id,
        site: row.site,
        location_id: row.location_id,
        location: row.location,
        labour_cost: Number(row.labour_cost || 0),
        days_worked: Number(row.days_worked || 0),
        start_date: row.start_date || null,
        end_date: row.end_date || null
      })));
    } catch (err) {
      console.error('LABOUR COSTS REPORT ERROR:', err);
      res.status(500).json({ error: 'Failed to load labour costs report' });
    }
  }
);

router.get(
  '/labour-costs/workers',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const [rows] = await db.query(
        `
        SELECT id, first_name, last_name
        FROM workers
        WHERE left_at IS NULL OR left_at >= CURDATE()
        ORDER BY last_name, first_name
        `
      );

      res.json(rows.map(row => ({
        id: row.id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed worker'
      })));
    } catch (err) {
      console.error('LABOUR COSTS WORKERS ERROR:', err);
      res.status(500).json({ error: 'Failed to load workers' });
    }
  }
);

/* ======================================================
  WORKERS INFORMATION REPORT
   ====================================================== */
router.get(
  '/workers-information',
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

      const [[rangeRow]] = await db.query(
        `
        SELECT
          MIN(work_date) AS min_date,
          MAX(work_date) AS max_date
        FROM timesheet_entries
        WHERE leave_type IS NOT NULL
        `
      );

      let minStartYear = currentStartDate.getFullYear();
      let maxStartYear = currentStartDate.getFullYear();

      if (rangeRow?.min_date) {
        const minBounds = getLeaveYearBounds(new Date(rangeRow.min_date), leaveYearStart);
        minStartYear = minBounds.startDate.getFullYear();
      }

      if (rangeRow?.max_date) {
        const maxBounds = getLeaveYearBounds(new Date(rangeRow.max_date), leaveYearStart);
        maxStartYear = maxBounds.startDate.getFullYear();
      }

      const availableYears = [];
      const startYear = Math.min(minStartYear, currentStartDate.getFullYear());
      const endYear = Math.max(maxStartYear, currentStartDate.getFullYear());

      for (let year = endYear; year >= startYear; year -= 1) {
        availableYears.push(year);
      }

      const [rows] = await db.query(
        `
        SELECT
          w.id,
          w.first_name,
          w.last_name,
          w.safe_pass_expiry_date,
          SUM(CASE WHEN te.leave_type = 'paid_sick' THEN 1 ELSE 0 END) AS paid_sick,
          SUM(CASE WHEN te.leave_type = 'sick' THEN 1 ELSE 0 END) AS sick,
          SUM(CASE WHEN te.leave_type = 'annual_leave' THEN 1 ELSE 0 END) AS annual_leave,
          SUM(CASE WHEN te.leave_type = 'unpaid_leave' THEN 1 ELSE 0 END) AS unpaid_leave,
          SUM(CASE WHEN te.leave_type = 'bank_holiday' THEN 1 ELSE 0 END) AS bank_holiday,
          SUM(CASE WHEN te.leave_type = 'absent' THEN 1 ELSE 0 END) AS absent
        FROM workers w
        LEFT JOIN timesheet_entries te
          ON te.worker_id = w.id
          AND te.leave_type IS NOT NULL
          AND te.work_date >= ?
          AND te.work_date < ?
        WHERE w.left_at IS NULL OR w.left_at >= CURDATE()
        GROUP BY w.id, w.first_name, w.last_name, w.safe_pass_expiry_date
        ORDER BY w.last_name, w.first_name
        `,
        [formatDate(startDate), formatDate(endDate)]
      );

      res.json({
        start_date: formatDate(startDate),
        end_date: formatDate(endDate),
        leave_year_start: leaveYearStart,
        leave_year_start_date: formatDate(startDate),
        leave_year_end_date: formatDate(endDate),
        leave_year_start_year: startDate.getFullYear(),
        available_years: availableYears,
        allowances: {
          paid_sick: paidSickAllowance,
          annual_leave: annualLeaveAllowance,
          bank_holiday: bankHolidayAllowance
        },
        rows: rows.map(row => ({
          id: row.id,
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed worker',
          safe_pass_expiry_date: row.safe_pass_expiry_date,
          paid_sick: Number(row.paid_sick || 0),
          paid_sick_remaining: Math.max(paidSickAllowance - Number(row.paid_sick || 0), 0),
          sick: Number(row.sick || 0),
          annual_leave: Number(row.annual_leave || 0),
          annual_leave_remaining: Math.max(annualLeaveAllowance - Number(row.annual_leave || 0), 0),
          unpaid_leave: Number(row.unpaid_leave || 0),
          bank_holiday: Number(row.bank_holiday || 0),
          bank_holiday_remaining: Math.max(bankHolidayAllowance - Number(row.bank_holiday || 0), 0),
          absent: Number(row.absent || 0)
        }))
      });
    } catch (err) {
      console.error('WORKERS INFORMATION REPORT ERROR:', err);
      res.status(500).json({ error: 'Failed to load workers information report' });
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
        SUM(po.net_amount)                                  AS total_po_net,
        SUM(IFNULL(inv.vat_amount, 0))                      AS total_invoice_vat,
        SUM(IFNULL(inv.invoiced_total, 0))                  AS total_invoice_gross,
        SUM(po.net_amount)
          - SUM(IFNULL(inv.invoiced_net, 0))                AS uninvoiced_net
      FROM purchase_orders po
      JOIN sites s      ON po.site_id = s.id
      JOIN locations l  ON po.location_id = l.id
      LEFT JOIN (
        SELECT purchase_order_id,
               SUM(net_amount) AS invoiced_net,
               SUM(vat_amount) AS vat_amount,
               SUM(total_amount) AS invoiced_total
        FROM invoices
        GROUP BY purchase_order_id
      ) inv ON inv.purchase_order_id = po.id
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

        ROUND(IFNULL(SUM(inv.invoiced_net), 0), 2)                      AS total_invoiced_net,

        ROUND(
          SUM(po.net_amount) - IFNULL(SUM(inv.invoiced_net), 0),
          2
        )                                                               AS uninvoiced_net

      FROM suppliers s
      JOIN purchase_orders po ON po.supplier_id = s.id
      LEFT JOIN (
        SELECT purchase_order_id, SUM(net_amount) AS invoiced_net
        FROM invoices
        GROUP BY purchase_order_id
      ) inv ON inv.purchase_order_id = po.id

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

/* ======================================================
   INVOICE REPORT (SUPER ADMIN ONLY)
   ====================================================== */
router.get(
  '/invoices',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
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
          i.id,
          i.invoice_number,
          DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
          EXTRACT(MONTH FROM i.invoice_date) AS month_num,
          MONTHNAME(i.invoice_date) AS month_name,
          YEAR(i.invoice_date) AS year_num,
          i.net_amount,
          i.vat_rate,
          i.vat_amount,
          i.total_amount,
          
          po.id AS po_id,
          po.po_number,
          po.net_amount AS po_net_amount,
          po.total_amount AS po_total_amount,
          
          s.id AS supplier_id,
          s.name AS supplier,
          
          si.id AS site_id,
          si.name AS site,
          si.address AS site_address,
          
          l.id AS location_id,
          l.name AS location,
          
          ps.id AS stage_id,
          ps.name AS stage

        FROM invoices i
        JOIN purchase_orders po ON i.purchase_order_id = po.id
        JOIN suppliers s ON po.supplier_id = s.id
        JOIN sites si ON po.site_id = si.id
        JOIN locations l ON po.location_id = l.id
        JOIN po_stages ps ON po.stage_id = ps.id

        WHERE po.status NOT IN ('cancelled', 'draft')
          ${siteFilter}

        ORDER BY i.invoice_date DESC, i.invoice_number DESC
        `,
        params
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load invoice report' });
    }
  }
);

module.exports = router;
