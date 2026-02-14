/**
 * Dynamic Title Middleware
 * Fetches company name from settings and makes it available to all views
 */

const SettingsService = require('../services/settingsService');

let cachedCompanyName = null;
let lastFetch = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Middleware to add dynamic title variables to all views
 */
async function dynamicTitle(req, res, next) {
  try {
    // Refresh cache if expired or not set
    if (!cachedCompanyName || !lastFetch || (Date.now() - lastFetch > CACHE_DURATION)) {
      const settings = await SettingsService.getSettings();
      cachedCompanyName = settings.company_name || 'Castlerock Homes';
      lastFetch = Date.now();
    }

    // Make company name available to all views
    res.locals.companyName = cachedCompanyName;
    res.locals.appName = 'CostTracker';
    
    // Override res.render to automatically format titles
    const originalRender = res.render.bind(res);
    res.render = function(view, locals, callback) {
      const renderLocals = Object.assign({}, res.locals, locals || {});
      
      // Format title as "Company Name | CostTracker | Page Title"
      if (renderLocals.pageTitle) {
        renderLocals.title = `${cachedCompanyName} | CostTracker | ${renderLocals.pageTitle}`;
      } else {
        // Default fallback
        renderLocals.title = `${cachedCompanyName} | CostTracker`;
      }
      
      originalRender(view, renderLocals, callback);
    };
    
    next();
  } catch (error) {
    console.error('Error loading company name for title:', error);
    // Fallback to default
    res.locals.companyName = 'Castlerock Homes';
    res.locals.appName = 'CostTracker';
    next();
  }
}

module.exports = dynamicTitle;
