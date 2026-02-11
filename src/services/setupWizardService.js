/**
 * Setup Wizard Service
 * Handles first-time application initialization including:
 * - Database schema initialization
 * - Default settings configuration
 * - Initial data creation (site, location, stage, worker)
 */

const db = require('../db');
const bcrypt = require('bcrypt');

class SetupWizardService {
  /**
   * Check if system is initialized (has data beyond schema)
   * @returns {Promise<boolean>}
   */
  static async isSystemInitialized() {
    try {
      const [rows] = await db.query('SELECT COUNT(*) as count FROM users');
      return rows[0]?.count > 0;
    } catch (error) {
      return false;
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
      const [result] = await db.query(
        'INSERT INTO sites (name, description) VALUES (?, ?)',
        [data.name, data.description || null]
      );

      return {
        id: result.insertId,
        name: data.name,
        description: data.description || null
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
      const [result] = await db.query(
        'INSERT INTO locations (name, site_id, description, address) VALUES (?, ?, ?, ?)',
        [data.name, data.site_id, data.description || null, data.address || null]
      );

      return {
        id: result.insertId,
        name: data.name,
        site_id: data.site_id,
        description: data.description || null,
        address: data.address || null
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
   * Complete full setup with all initial data
   * @param {Object} setupData - Complete setup data
   */
  static async completeSetup(setupData) {
    try {
      // 1. Initialize settings
      await this.initializeSettings(setupData.settings || {});

      // 2. Create super admin user
      const adminUser = await this.createInitialSuperAdmin(setupData.admin);

      // 3. Create initial site
      const site = await this.createInitialSite(setupData.site);

      // 4. Create initial location
      const location = await this.createInitialLocation({
        ...setupData.location,
        site_id: site.id
      });

      // 5. Create initial stage
      const stage = await this.createInitialStage(setupData.stage);

      // 6. Create initial worker
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
}

module.exports = SetupWizardService;
