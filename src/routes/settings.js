/**
 * Settings Routes
 * Handles admin settings management
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const SettingsService = require('../services/settingsService');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');

function normalizeLeaveYearStart(value) {
  const match = String(value || '').trim().match(/^(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const test = new Date(2000, month - 1, day);
  if (test.getMonth() + 1 !== month || test.getDate() !== day) return null;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * GET /settings/public
 * Public read-only header branding settings used by shared navbar
 */
router.get('/public', async (req, res) => {
  try {
    const settings = await SettingsService.getSettings();
    res.json({
      header_color: settings.header_color || '#212529',
      logo_path: settings.logo_path || '/assets/Logo.png',
      header_logo_mode: settings.header_logo_mode || 'image',
      header_logo_text: settings.header_logo_text || 'Castlerock Homes',
      company_name: settings.company_name || 'Castlerock Homes',
      company_email: settings.company_email || '',
      company_phone: settings.company_phone || ''
    });
  } catch (error) {
    console.error('Error fetching public settings:', error);
    res.status(500).json({ error: 'Failed to fetch public settings' });
  }
});

/**
 * GET /settings/branding
 * Get branding settings (super admin only)
 */
router.get(
  '/branding',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const settings = await SettingsService.getSettings();
      res.json({
        header_color: settings.header_color || '#212529',
        logo_path: settings.logo_path || '/assets/Logo.png',
        header_logo_mode: settings.header_logo_mode || 'image',
        header_logo_text: settings.header_logo_text || 'Castlerock Homes'
      });
    } catch (error) {
      console.error('Error fetching branding settings:', error);
      res.status(500).json({ error: 'Failed to fetch branding settings' });
    }
  }
);

/**
 * PUT /settings/branding
 * Update branding settings (super admin only)
 */
router.put(
  '/branding',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const {
        headerColor,
        logoMode,
        logoText
      } = req.body || {};

      if (!headerColor || !/^#[0-9a-fA-F]{6}$/.test(headerColor)) {
        return res.status(400).json({ error: 'headerColor must be a valid hex color (#RRGGBB)' });
      }

      if (!['image', 'text'].includes(logoMode)) {
        return res.status(400).json({ error: 'logoMode must be "image" or "text"' });
      }

      const trimmedText = String(logoText || '').trim();
      if (logoMode === 'text' && !trimmedText) {
        return res.status(400).json({ error: 'logoText is required when logoMode is "text"' });
      }

      if (trimmedText.length > 80) {
        return res.status(400).json({ error: 'logoText must be 80 characters or fewer' });
      }

      await SettingsService.updateSetting('header_color', headerColor);
      await SettingsService.updateSetting('header_logo_mode', logoMode);
      await SettingsService.updateSetting('header_logo_text', trimmedText || 'Castlerock Homes');

      res.json({ success: true, message: 'Branding settings updated successfully' });
    } catch (error) {
      console.error('Error updating branding settings:', error);
      res.status(500).json({ error: 'Failed to update branding settings' });
    }
  }
);

/**
 * GET /settings/financial
 * Returns currency + VAT rate options with usage counts
 */
router.get(
  '/financial',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff', 'viewer'),
  async (req, res) => {
    try {
      const settings = await SettingsService.getSettings();
      const currency_code = settings.currency_code || 'EUR';
      const sick_days_per_year = Number.isFinite(Number(settings.sick_days_per_year))
        ? Number(settings.sick_days_per_year)
        : 0;
      const annual_leave_days_per_year = Number.isFinite(Number(settings.annual_leave_days_per_year))
        ? Number(settings.annual_leave_days_per_year)
        : 0;
      const bank_holidays_per_year = Number.isFinite(Number(settings.bank_holidays_per_year))
        ? Number(settings.bank_holidays_per_year)
        : 0;
      const leave_year_start = normalizeLeaveYearStart(settings.leave_year_start || '01-01') || '01-01';
      const vatRates = settings.vat_rates
        ? JSON.parse(settings.vat_rates)
        : [0, 13.5, 23];

      // Aggregate usage from both POs and invoices
      const [poRates] = await db.query(
        'SELECT vat_rate, COUNT(*) AS count FROM purchase_orders GROUP BY vat_rate'
      );
      const [invRates] = await db.query(
        'SELECT vat_rate, COUNT(*) AS count FROM invoices GROUP BY vat_rate'
      );

      const usageMap = new Map();
      function addUsage(rows) {
        rows.forEach(r => {
          const percent = Number(r.vat_rate) < 1 ? Number(r.vat_rate) * 100 : Number(r.vat_rate);
          const key = Number(percent.toFixed(3));
          usageMap.set(key, (usageMap.get(key) || 0) + Number(r.count || 0));
        });
      }
      addUsage(poRates || []);
      addUsage(invRates || []);

      const usage = {};
      usageMap.forEach((count, rate) => {
        usage[String(rate)] = count;
      });

      res.json({
        currency_code,
        sick_days_per_year,
        annual_leave_days_per_year,
        bank_holidays_per_year,
        leave_year_start,
        vat_rates: vatRates,
        usage
      });
    } catch (error) {
      console.error('Error fetching financial settings:', error);
      res.status(500).json({ error: 'Failed to fetch financial settings' });
    }
  }
);

/**
 * PUT /settings/financial
 * Update currency + VAT list; block removal of in-use VAT rates
 */
router.put(
  '/financial',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const {
        currencyCode,
        vatRates,
        sickDaysPerYear,
        annualLeaveDaysPerYear,
        bankHolidaysPerYear,
        leaveYearStart
      } = req.body || {};

      const currency = String(currencyCode || 'EUR').toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        return res.status(400).json({ error: 'currencyCode must be a 3-letter ISO code' });
      }

      if (!Array.isArray(vatRates) || vatRates.length === 0) {
        return res.status(400).json({ error: 'vatRates must be a non-empty array' });
      }

      const normalizedRates = vatRates.map(r => Number(r)).filter(r => Number.isFinite(r));
      if (normalizedRates.length !== vatRates.length) {
        return res.status(400).json({ error: 'vatRates must contain numbers only' });
      }
      if (normalizedRates.some(r => r < 0 || r > 100)) {
        return res.status(400).json({ error: 'vatRates must be between 0 and 100' });
      }

      const leaveValues = [
        { key: 'sickDaysPerYear', value: sickDaysPerYear },
        { key: 'annualLeaveDaysPerYear', value: annualLeaveDaysPerYear },
        { key: 'bankHolidaysPerYear', value: bankHolidaysPerYear }
      ];

      for (const entry of leaveValues) {
        const numeric = Number(entry.value);
        if (!Number.isFinite(numeric) || numeric < 0 || numeric > 365) {
          return res.status(400).json({
            error: `${entry.key} must be a number between 0 and 365`
          });
        }
      }

      const normalizedLeaveYearStart = normalizeLeaveYearStart(leaveYearStart || '01-01');
      if (!normalizedLeaveYearStart) {
        return res.status(400).json({
          error: 'leaveYearStart must be in MM-DD format'
        });
      }

      // Current usage
      const [poRates] = await db.query(
        'SELECT vat_rate, COUNT(*) AS count FROM purchase_orders GROUP BY vat_rate'
      );
      const [invRates] = await db.query(
        'SELECT vat_rate, COUNT(*) AS count FROM invoices GROUP BY vat_rate'
      );

      const usageSet = new Set();
      function addUsage(rows) {
        rows.forEach(r => {
          const percent = Number(r.vat_rate) < 1 ? Number(r.vat_rate) * 100 : Number(r.vat_rate);
          usageSet.add(Number(percent.toFixed(3)));
        });
      }
      addUsage(poRates || []);
      addUsage(invRates || []);

      const newSet = new Set(normalizedRates.map(r => Number(r.toFixed(3))));
      const blocked = [...usageSet].filter(r => !newSet.has(r));
      if (blocked.length > 0) {
        return res.status(400).json({
          error: 'Cannot remove VAT rates that are in use',
          blockedRates: blocked
        });
      }

      await SettingsService.updateSetting('currency_code', currency);
      await SettingsService.updateSetting('vat_rates', JSON.stringify(normalizedRates));
      await SettingsService.updateSetting('sick_days_per_year', Number(sickDaysPerYear));
      await SettingsService.updateSetting('annual_leave_days_per_year', Number(annualLeaveDaysPerYear));
      await SettingsService.updateSetting('bank_holidays_per_year', Number(bankHolidaysPerYear));
      await SettingsService.updateSetting('leave_year_start', normalizedLeaveYearStart);

      res.json({
        success: true,
        currency_code: currency,
        vat_rates: normalizedRates,
        sick_days_per_year: Number(sickDaysPerYear),
        annual_leave_days_per_year: Number(annualLeaveDaysPerYear),
        bank_holidays_per_year: Number(bankHolidaysPerYear),
        leave_year_start: normalizedLeaveYearStart
      });
    } catch (error) {
      console.error('Error updating financial settings:', error);
      res.status(500).json({ error: 'Failed to update financial settings' });
    }
  }
);

/**
 * POST /settings/branding/logo
 * Upload logo image (super admin only)
 * Body: { dataUrl: 'data:image/png;base64,...', fileName?: 'logo.png' }
 */
router.post(
  '/branding/logo',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { dataUrl, fileName } = req.body || {};
      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ error: 'dataUrl is required' });
      }

      const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid image format. Allowed: PNG, JPG, JPEG, WEBP, SVG' });
      }

      const mimeType = match[1];
      const base64Data = match[2];
      const imageBuffer = Buffer.from(base64Data, 'base64');

      const maxBytes = 2 * 1024 * 1024; // 2 MB
      if (imageBuffer.length > maxBytes) {
        return res.status(400).json({ error: 'Image is too large. Maximum size is 2 MB' });
      }

      const extByMime = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/svg+xml': 'svg'
      };
      const ext = extByMime[mimeType] || 'png';

      const safeBaseName = String(fileName || 'header-logo')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 40) || 'header-logo';

      const finalFileName = `${safeBaseName}-${Date.now()}.${ext}`;
      const brandingDir = path.join(__dirname, '../../public/assets/branding');
      const outputPath = path.join(brandingDir, finalFileName);

      fs.mkdirSync(brandingDir, { recursive: true });
      fs.writeFileSync(outputPath, imageBuffer);

      const publicPath = `/assets/branding/${finalFileName}`;
      await SettingsService.updateSetting('logo_path', publicPath);
      await SettingsService.updateSetting('header_logo_mode', 'image');

      res.json({
        success: true,
        message: 'Logo uploaded successfully',
        logo_path: publicPath
      });
    } catch (error) {
      console.error('Error uploading branding logo:', error);
      res.status(500).json({ error: 'Failed to upload logo' });
    }
  }
);

/**
 * GET /settings
 * Get all site settings
 * Accessible to: super_admin, admin
 */
router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const settings = await SettingsService.getSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  }
);

/**
 * GET /settings/:key
 * Get a specific setting
 */
router.get(
  '/:key',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const { key } = req.params;
      const value = await SettingsService.getSetting(key);
      
      if (value === null) {
        return res.status(404).json({ error: 'Setting not found' });
      }

      res.json({ key, value });
    } catch (error) {
      console.error('Error fetching setting:', error);
      res.status(500).json({ error: 'Failed to fetch setting' });
    }
  }
);

/**
 * PUT /settings/:key
 * Update a specific setting
 */
router.put(
  '/:key',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (!value && value !== '') {
        return res.status(400).json({ error: 'Value is required' });
      }

      const result = await SettingsService.updateSetting(key, value);
      res.json({ success: true, message: 'Setting updated successfully', ...result });
    } catch (error) {
      console.error('Error updating setting:', error);
      res.status(500).json({ error: 'Failed to update setting' });
    }
  }
);

/**
 * POST /settings/bulk
 * Update multiple settings at once
 */
router.post(
  '/bulk',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const settings = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Invalid settings object' });
      }

      const results = {};
      for (const [key, value] of Object.entries(settings)) {
        const result = await SettingsService.updateSetting(key, value);
        results[key] = result;
      }

      res.json({ success: true, message: 'Settings updated successfully', updates: results });
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }
);

module.exports = router;
