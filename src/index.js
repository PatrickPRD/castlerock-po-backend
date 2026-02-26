
require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');
const { setupDatabase } = require('../database/setup');
const { ensureLeaveDefaults } = require('./services/leaveService');
const { checkSetupRequired } = require('./middleware/setupCheck');
const dynamicTitle = require('./middleware/dynamicTitle');

const app = express();

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust proxy headers to get real client IP
app.set('trust proxy', true);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, '../public')));

// ✅ Check if setup is required before accessing protected pages
app.use(checkSetupRequired);

// Add dynamic title support (Company Name | CostTracker | Page Title)
app.use(dynamicTitle);

// Root route → login page
app.get('/', (req, res) => {
  res.render('login', { pageTitle: 'Login' });
});

// Setup Wizard route
app.get('/setup-wizard.html', (req, res) => res.render('setup-wizard', { pageTitle: 'Setup Wizard' }));

// Page routes using EJS templates
app.get('/login.html', (req, res) => res.render('login', { pageTitle: 'Login' }));
app.get('/reset-password.html', (req, res) => res.render('reset-password', { pageTitle: 'Reset Password' }));
app.get('/dashboard.html', (req, res) => res.render('dashboard', { pageTitle: 'Purchase Orders' }));
app.get('/suppliers.html', (req, res) => res.render('suppliers', { pageTitle: 'Suppliers' }));
app.get('/invoice-entry.html', (req, res) => res.render('invoice-entry', { pageTitle: 'Invoice Entry' }));
app.get('/edit-supplier.html', (req, res) => res.render('edit-supplier', { pageTitle: 'Edit Supplier' }));
app.get('/edit-user.html', (req, res) => res.render('edit-user', { pageTitle: 'Edit User' }));
app.get('/users.html', (req, res) => res.render('users', { pageTitle: 'Users' }));
app.get('/workers.html', (req, res) => res.render('workers', { pageTitle: 'Workers' }));
app.get('/timesheets.html', (req, res) => res.render('timesheets', { pageTitle: 'Timesheets' }));
app.get('/locations.html', (req, res) => res.render('locations', { pageTitle: 'Locations' }));
app.get('/sites.html', (req, res) => res.render('sites', { pageTitle: 'Sites' }));
app.get('/stages.html', (req, res) => res.render('stages', { pageTitle: 'Stages' }));
app.get('/location-spread.html', (req, res) => res.render('location-spread', { pageTitle: 'Location Spread' }));
app.get('/backup-management.html', (req, res) => res.render('backup-management', { pageTitle: 'Backup Management' }));
app.get('/application-settings.html', (req, res) => res.render('application-settings', { pageTitle: 'Application Settings' }));
app.get('/header-branding.html', (req, res) => res.redirect('/application-settings.html'));
app.get('/location-report.html', (req, res) => res.render('location-report', { pageTitle: 'Location Report' }));
app.get('/supplier-report.html', (req, res) => res.render('supplier-report', { pageTitle: 'Supplier Report' }));
app.get('/invoice-report.html', (req, res) => res.render('invoice-report', { pageTitle: 'Invoice Report' }));
app.get('/workers-information.html', (req, res) => res.render('workers-information', { pageTitle: 'Workers Information' }));
app.get('/leave-report.html', (req, res) => res.redirect('/workers-information.html'));
app.get('/labour-costs.html', (req, res) => res.render('labour-costs', { pageTitle: 'Labour Costs' }));
app.get('/gdpr.html', (req, res) => res.render('gdpr', { pageTitle: 'GDPR Privacy Notice' }));
app.get('/audit-log.html', (req, res) => res.render('audit-log', { pageTitle: 'Audit Log' }));

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

async function ensureSchemaReady() {
  console.log('🔄 Waiting for database connection...');
  await pool.ready;
  console.log('✅ Database connection established');

  try {
    console.log('🔍 Checking schema tables...');
    await pool.query('SELECT 1 FROM site_settings LIMIT 1');
    console.log('✅ Schema tables verified');
  } catch (error) {
    const message = String(error?.message || '');
    if (error?.code === 'ER_NO_SUCH_TABLE' || message.includes("doesn't exist")) {
      console.warn('⚠️  Missing schema tables; running database setup...');
      await setupDatabase();
      console.log('✅ Database setup completed');
      return;
    }

    throw error;
  }
}

async function ensureInvoiceUniquenessPerPO() {
  console.log('🔍 Checking invoice uniqueness indexes...');

  const [indexRows] = await pool.query(`
    SELECT
      INDEX_NAME,
      NON_UNIQUE,
      GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns_csv
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'invoices'
    GROUP BY INDEX_NAME, NON_UNIQUE
  `);

  const hasCompositeUnique = indexRows.some(
    row => Number(row.NON_UNIQUE) === 0 && row.columns_csv === 'purchase_order_id,invoice_number'
  );

  const legacyGlobalUniqueIndexes = indexRows
    .filter(row => Number(row.NON_UNIQUE) === 0 && row.columns_csv === 'invoice_number' && row.INDEX_NAME !== 'PRIMARY')
    .map(row => row.INDEX_NAME);

  for (const indexName of legacyGlobalUniqueIndexes) {
    const safeIndexName = String(indexName).replace(/`/g, '');
    console.log(`🛠️  Dropping legacy unique index: ${safeIndexName}`);
    await pool.query(`ALTER TABLE invoices DROP INDEX \`${safeIndexName}\``);
  }

  if (!hasCompositeUnique) {
    console.log('🛠️  Adding composite unique index: uniq_invoice_number_per_po');
    await pool.query(
      'ALTER TABLE invoices ADD UNIQUE KEY uniq_invoice_number_per_po (purchase_order_id, invoice_number)'
    );
  }

  console.log('✅ Invoice uniqueness index verified (per PO)');
}

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

async function startServer() {
  console.log('🔧 Starting server initialization...');
  await ensureSchemaReady();
  await ensureInvoiceUniquenessPerPO();
  console.log('✅ Schema ready, starting HTTP listener...');

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on ${HOST}:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    ensureLeaveDefaults().catch(error => {
      console.error('Failed to ensure leave defaults:', error);
    });
  });
}

startServer().catch(error => {
  console.error('❌ Server startup failed:', error.message || error);
  process.exit(1);
});
