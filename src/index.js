
require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const { ensureLeaveDefaults } = require('./services/leaveService');
const { checkSetupRequired } = require('./middleware/setupCheck');

const app = express();

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, '../public')));

// ✅ Check if setup is required before accessing protected pages
app.use(checkSetupRequired);

// Root route → login page
app.get('/', (req, res) => {
  res.render('login');
});

// Setup Wizard route
app.get('/setup-wizard.html', (req, res) => res.render('setup-wizard'));

// Page routes using EJS templates
app.get('/login.html', (req, res) => res.render('login'));
app.get('/reset-password.html', (req, res) => res.render('reset-password'));
app.get('/dashboard.html', (req, res) => res.render('dashboard'));
app.get('/suppliers.html', (req, res) => res.render('suppliers'));
app.get('/create-po.html', (req, res) => res.render('create-po'));
app.get('/edit-po.html', (req, res) => res.render('edit-po'));
app.get('/invoice-entry.html', (req, res) => res.render('invoice-entry'));
app.get('/edit-supplier.html', (req, res) => res.render('edit-supplier'));
app.get('/edit-user.html', (req, res) => res.render('edit-user'));
app.get('/users.html', (req, res) => res.render('users'));
app.get('/workers.html', (req, res) => res.render('workers'));
app.get('/timesheets.html', (req, res) => res.render('timesheets'));
app.get('/locations.html', (req, res) => res.render('locations'));
app.get('/sites.html', (req, res) => res.render('sites'));
app.get('/stages.html', (req, res) => res.render('stages'));
app.get('/location-spread.html', (req, res) => res.render('location-spread'));
app.get('/backup-management.html', (req, res) => res.render('backup-management'));
app.get('/application-settings.html', (req, res) => res.render('application-settings'));
app.get('/header-branding.html', (req, res) => res.redirect('/application-settings.html'));
app.get('/location-report.html', (req, res) => res.render('location-report'));
app.get('/supplier-report.html', (req, res) => res.render('supplier-report'));
app.get('/invoice-report.html', (req, res) => res.render('invoice-report'));
app.get('/workers-information.html', (req, res) => res.render('workers-information'));
app.get('/leave-report.html', (req, res) => res.redirect('/workers-information.html'));
app.get('/labour-costs.html', (req, res) => res.render('labour-costs'));
app.get('/gdpr.html', (req, res) => res.render('gdpr'));
app.get('/audit-log.html', (req, res) => res.render('audit-log'));

// Health check with database connectivity test
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      database: 'connected',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

app.get('/ui.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(
    path.join(__dirname, 'services', 'ui.js')
  );
});

const supplierRoutes = require('./routes/suppliers');
app.use('/suppliers', supplierRoutes);


const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const setupWizardRoutes = require('./routes/setupWizard');
app.use('/setup-wizard', setupWizardRoutes);

const auditRoutes = require('./routes/audit');
app.use('/audit', auditRoutes);

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const backupRoutes = require('./routes/backups');
app.use('/backups', backupRoutes);

const lookupRoutes = require('./routes/lookups');
app.use('/', lookupRoutes);

// Location Spread Rules
const locationSpreadRoutes = require('./routes/locationSpread');
app.use('/location-spread-rules', locationSpreadRoutes);

// Purchase Orders
const poRoutes = require('./routes/purchaseOrders');
app.use('/purchase-orders', poRoutes);

// Invoices
const invoiceRoutes = require('./routes/invoices');
app.use('/invoices', invoiceRoutes);

// Reports
const reportRoutes = require('./routes/reports');
app.use('/reports', reportRoutes);

// PDFs
const pdfRoutes = require('./routes/pdfs');
app.use('/pdfs', pdfRoutes);

// Settings
const settingsRoutes = require('./routes/settings');
app.use('/settings', settingsRoutes);

// Timesheets
const timesheetRoutes = require('./routes/timesheets');
app.use('/timesheets', timesheetRoutes);

// ✅ EXPORTS — THIS IS THE CRITICAL PART
const exportRoutes = require('./routes/exports');
app.use('/exports', exportRoutes);

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

  ensureLeaveDefaults().catch(error => {
    console.error('Failed to ensure leave defaults:', error);
  });
});
