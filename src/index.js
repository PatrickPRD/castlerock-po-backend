require('dotenv').config();
const express = require('express');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

// Root route → login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});



// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

const supplierRoutes = require('./routes/suppliers');
app.use('/suppliers', supplierRoutes);


const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const auditRoutes = require('./routes/audit');
app.use('/audit', auditRoutes);

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const lookupRoutes = require('./routes/lookups');
app.use('/', lookupRoutes);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
