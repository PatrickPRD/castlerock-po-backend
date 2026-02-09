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
      header_logo_text: settings.header_logo_text || 'Castlerock Homes'
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
