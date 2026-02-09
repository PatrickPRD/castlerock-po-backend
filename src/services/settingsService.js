/**
 * Site Settings Service
 * Manages retrieval and caching of site configuration
 */

const db = require('../db');

class SettingsService {
  static settingsCache = null;
  static cacheTime = null;
  static cacheDuration = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all settings from database
   * @param {boolean} useCache - Whether to use cached values
   * @returns {Promise<Object>} Settings object
   */
  static async getSettings(useCache = true) {
    try {
      // Return cached settings if available and not expired
      if (useCache && this.settingsCache && this.cacheTime) {
        const now = Date.now();
        if (now - this.cacheTime < this.cacheDuration) {
          return this.settingsCache;
        }
      }

      // Fetch from database
      const [rows] = await db.query('SELECT `key`, `value` FROM site_settings');
      
      // Convert array format to object
      const settings = {};
      rows.forEach(row => {
        settings[row.key] = row.value;
      });

      // Cache the settings
      this.settingsCache = settings;
      this.cacheTime = Date.now();

      return settings;
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Return default settings on error
      return this.getDefaultSettings();
    }
  }

  /**
   * Get a specific setting value
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value if not found
   * @returns {Promise<*>} Setting value
   */
  static async getSetting(key, defaultValue = null) {
    const settings = await this.getSettings();
    return settings[key] !== undefined ? settings[key] : defaultValue;
  }

  /**
   * Update a setting
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {Promise<Object>} Result
   */
  static async updateSetting(key, value) {
    try {
      await db.query(
        'INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
        [key, value, value]
      );

      // Invalidate cache
      this.settingsCache = null;
      this.cacheTime = null;

      return { success: true, key, value };
    } catch (error) {
      console.error('Error updating setting:', error);
      throw error;
    }
  }

  /**
   * Get default settings
   * @returns {Object} Default settings
   */
  static getDefaultSettings() {
    return {
      logo_path: '/assets/Logo.png',
      header_color: '#212529',
      header_logo_mode: 'image',
      header_logo_text: 'Castlerock Homes',
      accent_color: '#1e40af',
      company_name: 'Castlerock Homes',
      company_address: '',
      company_phone: '',
      company_email: ''
    };
  }

  /**
   * Clear cache
   */
  static clearCache() {
    this.settingsCache = null;
    this.cacheTime = null;
  }
}

module.exports = SettingsService;
