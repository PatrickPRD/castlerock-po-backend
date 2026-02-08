/**
 * Settings Routes
 * Handles admin settings management
 */

const express = require('express');
const router = express.Router();
const SettingsService = require('../services/settingsService');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

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
