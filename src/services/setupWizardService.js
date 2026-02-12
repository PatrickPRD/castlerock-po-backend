/**
 * Setup Wizard Service
 * Handles first-time application initialization including:
 * - Database schema initialization
 * - Default settings configuration
 * - Initial data creation (site, location, stage, worker)
 */

const db = require('../db');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

class SetupWizardService {
  /**
   * Check if system is initialized (has data beyond schema)
   * @returns {Promise<boolean>}
   */
  static async isSystemInitialized() {
    try {
      // First, ensure schema tables exist
      try {
        await this.ensureTablesExist();
      } catch (schemaErr) {
        console.warn('Could not ensure schema exists:', schemaErr.message);
      }
      
      const [rows] = await db.query('SELECT COUNT(*) as count FROM users');
      return rows[0]?.count > 0;
    } catch (error) {
      console.error('Error checking if system initialized:', error.message);
      return false;
    }
  }

  /**
   * Ensure required tables exist (create schema if needed)
   * @private
   */
  static async ensureTablesExist() {
    try {
      // Simple check - if we can query the users table, schema exists
      await db.query('SELECT 1 FROM users LIMIT 1');
    } catch (error) {
      // Table doesn't exist - this is expected on first load
      // The app will use the setup wizard to initialize
      if (error.message.includes('no such table') || error.message.includes("doesn't exist")) {
        console.info('Schema tables do not exist yet - setup wizard will initialize them');
      }
      throw error; // Re-throw so caller knows tables don't exist
    }
  }

  /**
   * Get setup wizard status
   * @returns {Promise<Object>}
   */
  static async getSetupStatus() {
    try {
      const [users] = await db.query('SELECT COUNT(*) as count FROM users');
      const [sites] = await db.query('SELECT COUNT(*) as count FROM sites');
      const [locations] = await db.query('SELECT COUNT(*) as count FROM locations');
      const [stages] = await db.query('SELECT COUNT(*) as count FROM po_stages');
      const [workers] = await db.query('SELECT COUNT(*) as count FROM workers');
      const [settings] = await db.query('SELECT COUNT(*) as count FROM site_settings');

      return {
        initialized: users[0]?.count > 0,
        users: users[0]?.count || 0,
        sites: sites[0]?.count || 0,
        locations: locations[0]?.count || 0,
        stages: stages[0]?.count || 0,
        workers: workers[0]?.count || 0,
        settingsConfigured: settings[0]?.count > 0
      };
    } catch (error) {
      return {
        initialized: false,
        error: error.message
      };
    }
  }

  /**
   * Initialize default settings
   * @param {Object} settings - Settings to initialize
   */
  static async initializeSettings(settings) {
    try {
      const defaults = {
        logo_path: settings.logo_path || '/assets/Logo.png',
        favicon_path: settings.favicon_path || null,
        header_color: settings.header_color || '#212529',
        header_logo_mode: settings.header_logo_mode || 'image',
        header_logo_text: settings.header_logo_text || 'Castlerock Homes',
        accent_color: settings.accent_color || '#1e40af',
        currency_code: settings.currency_code || 'EUR',
        vat_rates: settings.vat_rates || JSON.stringify([0, 13.5, 23]),
        sick_days_per_year: settings.sick_days_per_year || '3',
        annual_leave_days_per_year: settings.annual_leave_days_per_year || '20',
        bank_holidays_per_year: settings.bank_holidays_per_year || '10',
        leave_year_start: settings.leave_year_start || '01-01',
        company_name: settings.company_name || 'Castlerock Homes',
        company_trading_name: settings.company_trading_name || '',
        company_address: settings.company_address || '',
        company_vat_number: settings.company_vat_number || '',
        company_cro_number: settings.company_cro_number || '',
        company_phone: settings.company_phone || '',
        company_email: settings.company_email || ''
      };

      for (const [key, value] of Object.entries(defaults)) {
        await db.query(
          'INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
          [key, value, value]
        );
      }

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to initialize settings: ${error.message}`);
    }
  }

  /**
   * Create initial site
   * @param {Object} data - Site data
   */
  static async createInitialSite(data) {
    try {
      // Sites table requires: name, site_letter, address (optional)
      // Generate site letter from name (first letter, or find next available)
      const siteLetter = data.name.charAt(0).toUpperCase();
      
      const [result] = await db.query(
        'INSERT INTO sites (name, site_letter, address) VALUES (?, ?, ?)',
        [data.name, siteLetter, data.address || null]
      );

      return {
        id: result.insertId,
        name: data.name,
        site_letter: siteLetter,
        address: data.address || null
      };
    } catch (error) {
      throw new Error(`Failed to create site: ${error.message}`);
    }
  }

  /**
   * Create initial location
   * @param {Object} data - Location data
   */
  static async createInitialLocation(data) {
    try {
      // Locations table has: name, type, site_id
      const [result] = await db.query(
        'INSERT INTO locations (name, site_id, type) VALUES (?, ?, ?)',
        [data.name, data.site_id, data.type || null]
      );

      return {
        id: result.insertId,
        name: data.name,
        site_id: data.site_id,
        type: data.type || null
      };
    } catch (error) {
      throw new Error(`Failed to create location: ${error.message}`);
    }
  }

  /**
   * Create initial stage
   * @param {Object} data - Stage data
   */
  static async createInitialStage(data) {
    try {
      const [result] = await db.query(
        'INSERT INTO po_stages (name, active) VALUES (?, 1)',
        [data.name]
      );

      return {
        id: result.insertId,
        name: data.name,
        active: 1
      };
    } catch (error) {
      throw new Error(`Failed to create stage: ${error.message}`);
    }
  }

  /**
   * Create initial worker
   * @param {Object} data - Worker data
   */
  static async createInitialWorker(data) {
    try {
      const [result] = await db.query(
        `INSERT INTO workers (
          first_name,
          last_name,
          nickname,
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
          login_no,
          notes,
          active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          data.first_name,
          data.last_name,
          data.nickname || null,
          data.email || null,
          data.mobile_number || null,
          data.address || null,
          data.bank_details || null,
          data.pps_number || null,
          data.weekly_take_home || null,
          data.weekly_cost || null,
          data.safe_pass_number || null,
          data.safe_pass_expiry_date || null,
          data.date_of_employment || null,
          data.employee_id || null,
          data.login_no || null,
          data.notes || null
        ]
      );

      return {
        id: result.insertId,
        first_name: data.first_name,
        last_name: data.last_name,
        nickname: data.nickname || null,
        email: data.email || null,
        mobile_number: data.mobile_number || null,
        address: data.address || null,
        bank_details: data.bank_details || null,
        pps_number: data.pps_number || null,
        weekly_take_home: data.weekly_take_home || null,
        weekly_cost: data.weekly_cost || null,
        safe_pass_number: data.safe_pass_number || null,
        safe_pass_expiry_date: data.safe_pass_expiry_date || null,
        date_of_employment: data.date_of_employment || null,
        employee_id: data.employee_id || null,
        login_no: data.login_no || null,
        notes: data.notes || null
      };
    } catch (error) {
      throw new Error(`Failed to create worker: ${error.message}`);
    }
  }

  /**
   * Create initial super admin user
   * @param {Object} data - User data
   */
  static async createInitialSuperAdmin(data) {
    try {
      const passwordHash = await bcrypt.hash(data.password, 10);

      const [result] = await db.query(
        `INSERT INTO users (
          email,
          password_hash,
          first_name,
          last_name,
          role,
          active
        ) VALUES (?, ?, ?, ?, 'super_admin', 1)`,
        [
          data.email,
          passwordHash,
          data.first_name,
          data.last_name
        ]
      );

      return {
        id: result.insertId,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        role: 'super_admin'
      };
    } catch (error) {
      throw new Error(`Failed to create super admin user: ${error.message}`);
    }
  }

  /**
   * Save logo file from base64 data URL
   * @param {Object} logoData - Logo data with dataUrl and fileName
   * @returns {Promise<string>} - Public path to saved logo
   */
  static async saveLogo(logoData) {
    try {
      const { dataUrl, fileName } = logoData;

      if (!dataUrl || typeof dataUrl !== 'string') {
        throw new Error('Invalid logo data');
      }

      // Parse the data URL
      const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        throw new Error('Invalid image format. Allowed: PNG, JPG, JPEG, WEBP, SVG');
      }

      const mimeType = match[1];
      const base64Data = match[2];
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Validate size (2MB max)
      const maxBytes = 2 * 1024 * 1024;
      if (imageBuffer.length > maxBytes) {
        throw new Error('Image is too large. Maximum size is 2 MB');
      }

      // Determine file extension
      const extByMime = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/svg+xml': 'svg'
      };
      const ext = extByMime[mimeType] || 'png';

      // Create safe filename
      const safeBaseName = String(fileName || 'company-logo')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 40) || 'company-logo';

      const finalFileName = `${safeBaseName}-${Date.now()}.${ext}`;
      const brandingDir = path.join(__dirname, '../../public/assets/branding');
      const outputPath = path.join(brandingDir, finalFileName);

      // Ensure directory exists
      fs.mkdirSync(brandingDir, { recursive: true });

      // Write file
      fs.writeFileSync(outputPath, imageBuffer);

      // Return public path
      return `/assets/branding/${finalFileName}`;
    } catch (error) {
      throw new Error(`Failed to save logo: ${error.message}`);
    }
  }

  /**
   * Save favicon file from base64 data URL
   * @param {Object} faviconData - { dataUrl, fileName }
   * @returns {Promise<string>} Public path to saved favicon
   */
  static async saveFavicon(faviconData) {
    try {
      const { dataUrl, fileName } = faviconData;

      if (!dataUrl || typeof dataUrl !== 'string') {
        throw new Error('Invalid favicon data');
      }

      // Parse the data URL
      const match = dataUrl.match(/^data:(image\/(?:x-icon|png|svg\+xml|vnd\.microsoft\.icon));base64,([A-Za-z0-9+/=]+)$/);
      if (!match) {
        throw new Error('Invalid favicon format. Allowed: ICO, PNG, SVG');
      }

      const actualMimeType = match[1];
      const base64Data = match[2];
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Validate size (500KB max for favicon)
      const maxBytes = 500 * 1024;
      if (imageBuffer.length > maxBytes) {
        throw new Error('Favicon is too large. Maximum size is 500 KB');
      }

      // Determine file extension
      const extByMime = {
        'image/x-icon': 'ico',
        'image/vnd.microsoft.icon': 'ico',
        'image/png': 'png',
        'image/svg+xml': 'svg'
      };
      const ext = extByMime[actualMimeType] || 'ico';

      // Create safe filename
      const safeBaseName = String(fileName || 'favicon')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 40) || 'favicon';

      const finalFileName = `${safeBaseName}-${Date.now()}.${ext}`;
      const brandingDir = path.join(__dirname, '../../public/assets/branding');
      const outputPath = path.join(brandingDir, finalFileName);

      // Ensure directory exists
      fs.mkdirSync(brandingDir, { recursive: true });

      // Write file
      fs.writeFileSync(outputPath, imageBuffer);

      // Return public path
      return `/assets/branding/${finalFileName}`;
    } catch (error) {
      throw new Error(`Failed to save favicon: ${error.message}`);
    }
  }

  /**
   * Complete full setup with all initial data
   * @param {Object} setupData - Complete setup data
   */
  static async completeSetup(setupData) {
    try {
      // 1. Initialize settings
      await this.initializeSettings(setupData.settings || {});

      // 2. Upload and save logo if provided
      if (setupData.logo?.dataUrl) {
        const logoPath = await this.saveLogo(setupData.logo);
        await db.query(
          'INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
          ['logo_path', logoPath, logoPath]
        );
        await db.query(
          'INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
          ['header_logo_mode', 'image', 'image']
        );
      }

      // 2b. Upload and save favicon if provided
      if (setupData.favicon?.dataUrl) {
        const faviconPath = await this.saveFavicon(setupData.favicon);
        await db.query(
          'INSERT INTO site_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
          ['favicon_path', faviconPath, faviconPath]
        );
      }

      // 3. Create super admin user
      const adminUser = await this.createInitialSuperAdmin(setupData.admin);

      // 4. Create initial site
      const site = await this.createInitialSite(setupData.site);

      // 5. Create initial location
      const location = await this.createInitialLocation({
        ...setupData.location,
        site_id: site.id
      });

      // 6. Create initial stage
      const stage = await this.createInitialStage(setupData.stage);

      // 7. Create initial worker
      const worker = await this.createInitialWorker({
        ...setupData.worker,
        site_id: site.id,
        location_id: location.id
      });

      return {
        success: true,
        message: 'System setup completed successfully',
        data: {
          adminUser,
          site,
          location,
          stage,
          worker
        }
      };
    } catch (error) {
      throw new Error(`Setup failed: ${error.message}`);
    }
  }

  /**
   * Reset application to setup wizard state
   * Deletes ALL data including users and resets to initial state
   */
  static async resetToWizard() {
    try {
      console.log('🗑️ Deleting all data including users...');

      // Get all tables
      const [tables] = await db.query(
        `SELECT table_name AS tableName
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_type = 'BASE TABLE'
           AND table_name NOT IN ('schema_migrations')`
      );

      // Disable foreign key checks
      await db.query('SET FOREIGN_KEY_CHECKS=0');

      // Delete all data from all tables
      for (const { tableName } of tables) {
        try {
          await db.query(`DELETE FROM \`${tableName}\` WHERE 1=1`);
          console.log(`✅ Cleared table: ${tableName}`);
        } catch (err) {
          console.warn(`⚠️ Could not clear table ${tableName}:`, err.message);
        }
      }

      // Re-enable foreign key checks
      await db.query('SET FOREIGN_KEY_CHECKS=1');

      console.log('✅ Application reset to wizard state. All data deleted.');

      return {
        success: true,
        message: 'All data deleted. Application reset to setup wizard.'
      };
    } catch (error) {
      throw new Error(`Reset failed: ${error.message}`);
    }
  }
}

module.exports = SetupWizardService;
