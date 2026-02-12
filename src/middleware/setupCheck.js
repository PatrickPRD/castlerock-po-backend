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
      try {
        isInitialized = await SetupWizardService.isSystemInitialized();
        console.log('Setup check: isInitialized=', isInitialized);
      } catch (dbError) {
        // If DB check fails, treat as NOT initialized so wizard shows
        console.warn('Database check failed, showing setup wizard:', dbError.message);
        isInitialized = false;
      }
      setupChecked = true;
    }

    console.log(`[${req.method} ${req.path}] isInitialized=${isInitialized}, setupChecked=${setupChecked}`);

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
        '/auth'
      ];

      const isAllowedRoute = allowedRoutes.some(route => req.path.startsWith(route));

      if (!isAllowedRoute) {
        console.log(`Redirecting ${req.path} to setup wizard (not in allowed routes)`);
        return res.redirect('/setup-wizard.html');
      }
    }

    next();
  } catch (error) {
    console.error('Setup check middleware error:', error);
    // On unexpected error, show wizard to be safe
    return res.redirect('/setup-wizard.html');
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
