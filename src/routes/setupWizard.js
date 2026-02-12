const express = require('express');
const router = express.Router();
const SetupWizardService = require('../services/setupWizardService');
const { invalidateSetupCache } = require('../middleware/setupCheck');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

/**
 * GET /setup-wizard - Get setup status
 * Returns whether system is initialized and current data counts
 */
router.get('/status', async (req, res) => {
  try {
    const status = await SetupWizardService.getSetupStatus();
    res.json(status);
  } catch (error) {
    console.error('Setup status error:', error);
    res.status(500).json({
      error: 'Failed to get setup status',
      details: error.message
    });
  }
});

/**
 * POST /setup-wizard/complete - Complete the setup wizard
 * Initializes database with default settings, admin user, and sample data
 */
router.post('/complete', async (req, res) => {
  try {
    const { admin, site, location, stage, worker, settings, logo } = req.body;

    // Validation
    if (!admin?.email || !admin?.password || !admin?.first_name || !admin?.last_name) {
      return res.status(400).json({
        error: 'Missing required admin user fields: email, password, first_name, last_name'
      });
    }

    if (!site?.name) {
      return res.status(400).json({
        error: 'Missing required site name'
      });
    }

    if (!location?.name) {
      return res.status(400).json({
        error: 'Missing required location name'
      });
    }

    if (!stage?.name) {
      return res.status(400).json({
        error: 'Missing required stage name'
      });
    }

    if (!worker?.first_name || !worker?.last_name) {
      return res.status(400).json({
        error: 'Missing required worker fields: first_name, last_name'
      });
    }

    // Check if already initialized
    const isInitialized = await SetupWizardService.isSystemInitialized();
    if (isInitialized) {
      return res.status(400).json({
        error: 'System is already initialized'
      });
    }

    // Complete setup
    const result = await SetupWizardService.completeSetup({
      admin,
      site,
      location,
      stage,
      worker,
      settings,
      logo
    });

    // Invalidate setup cache so middleware knows system is initialized
    invalidateSetupCache();

    res.json(result);
  } catch (error) {
    console.error('Setup wizard error:', error);
    res.status(500).json({
      error: 'Setup failed',
      details: error.message
    });
  }
});

/**
 * POST /setup-wizard/reset - Reset application to setup wizard state
 * Deletes ALL data including users and returns to setup wizard (super admin only)
 */
router.post(
  '/reset',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { confirmText } = req.body;

      // Require exact confirmation text
      if (confirmText !== 'RESET TO WIZARD') {
        return res.status(400).json({
          error: 'Invalid confirmation. Type "RESET TO WIZARD" to confirm.'
        });
      }

      console.log('🔄 Resetting application to setup wizard state...');
      
      await SetupWizardService.resetToWizard();

      // Invalidate setup cache so middleware redirects to wizard
      invalidateSetupCache();

      res.json({
        success: true,
        message: 'Application reset to setup wizard. All data deleted. You will be redirected to the setup wizard.'
      });
    } catch (error) {
      console.error('Reset error:', error);
      res.status(500).json({
        error: 'Reset failed',
        details: error.message
      });
    }
  }
);

module.exports = router;
