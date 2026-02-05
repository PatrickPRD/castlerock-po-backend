
require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

// Root route → login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

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
});
