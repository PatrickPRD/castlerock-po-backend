/**
 * Setup Check Middleware
 * Ensures the system is initialized before allowing access to protected routes
 */

const SetupWizardService = require('../services/setupWizardService');

let setupChecked = false;
let isInitialized = false;

async function checkSetupRequired(req, res, next) {
  try {
    // Don't check on every request - cache the result
    if (!setupChecked) {
      isInitialized = await SetupWizardService.isSystemInitialized();
      setupChecked = true;
    }

    // If not initialized and trying to access a protected page, redirect to setup
    if (!isInitialized) {
      // Allow these routes without redirect
      const allowedRoutes = [
        '/setup-wizard',
        '/setup-wizard.html',
        '/health',
        '/login',
        '/login.html',
        '/reset-password.html',
        '/auth',
        '/'
      ];

      const isAllowedRoute = allowedRoutes.some(route => req.path.startsWith(route));

      if (!isAllowedRoute) {
        return res.redirect('/setup-wizard.html');
      }
    }

    next();
  } catch (error) {
    console.error('Setup check error:', error);
    next();
  }
}

/**
 * Invalidate setup cache when setup is completed
 */
function invalidateSetupCache() {
  setupChecked = false;
  isInitialized = true;
}

module.exports = {
  checkSetupRequired,
  invalidateSetupCache
};
