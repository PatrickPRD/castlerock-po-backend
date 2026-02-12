# 🚀 Quick Start Guide

**👉 For production deployment on AWS EC2 + RDS:**
- See [AWS_EC2_RDS_DEPLOYMENT.md](AWS_EC2_RDS_DEPLOYMENT.md)
- Use `npm run setup-multi-app` for automated configuration
- Supports running multiple app versions on the same server

---

## Local Development Setup

## Step 1: Update MySQL Connection Details

Open [.env](.env) and update your MySQL server connection details:
```env
DB_HOST=your_mysql_host        # MySQL server address (default: 127.0.0.1)
DB_USER=your_mysql_user        # MySQL user (default: admin)
DB_PASSWORD=your_mysql_password # MySQL password
DB_PORT=your_mysql_port        # MySQL port (default: 3306)
```

**Note:** The schema `CostTracker_db` will be created automatically on your existing MySQL server.

## Step 2: Create Database Schema and Tables

Run the setup script to initialize the schema and tables:
```bash
npm run setup
```

This will:
- Create the `CostTracker_db` schema on your MySQL server
- Create all required tables
- Create a default super admin user

**Default Admin Credentials:**
- 📧 Email: `admin@castlerock.com`
- 🔑 Password: `Admin@123`

## Step 3: Start the Server

Press `F5` in VSCode or run:
```bash
npm run dev
```

## Step 4: Complete Setup Wizard

Open http://localhost:3000 in your browser. You'll be automatically redirected to the **Setup Wizard** if this is a fresh installation.

The Setup Wizard guides you through configuring:
- ✅ **Admin User** - Confirm or update the admin account
- ✅ **Site** - Create your first site (e.g., "Main Construction Site")
- ✅ **Location** - Add a location within the site
- ✅ **PO Stage** - Create a purchase order stage (e.g., "Draft", "Approved")
- ✅ **Worker** - Add your first worker
- ✅ **App Settings** - Configure currency and leave allowances

After completing the wizard, you'll be redirected to the main dashboard.

## Step 5: Log In and Use the Application

Log in with your admin credentials if not already authenticated. You now have access to:
- Workers management
- Purchase Orders
- Timesheets
- Reports
- Admin controls

---

## EC2 (Amazon Linux 2023) - Puppeteer Dependencies
If you will run PDF generation on EC2, install the Chromium dependencies:
```bash
sudo dnf update -y
sudo dnf install -y \
   atk \
   cairo \
   cups-libs \
   dbus-glib \
   expat \
   fontconfig \
   freetype \
   glib2 \
   gtk3 \
   libX11 \
   libXcomposite \
   libXcursor \
   libXdamage \
   libXext \
   libXfixes \
   libXi \
   libXrandr \
   libXrender \
   libXScrnSaver \
   libXtst \
   nss \
   pango \
   alsa-lib \
   xorg-x11-fonts-Type1 \
   xorg-x11-fonts-misc \
   xorg-x11-utils

# Optional: add more fonts
sudo dnf install -y google-noto-sans-fonts

# If running as non-root, ensure Puppeteer cache is writable
export PUPPETEER_CACHE_DIR=/home/ec2-user/.cache/puppeteer
```

---

## Alternative: Manual Database Setup

If you prefer to run SQL manually, execute these files in order:

1. **Create database and tables:**
   ```bash
   mysql -u root -p < database/schema.sql
   ```

2. **Seed initial data:**
   ```bash
   mysql -u root -p < database/seed.sql
   ```

---

## Troubleshooting

**Access Denied Error:**
- Make sure your MySQL password in `.env` matches your actual MySQL root password
- Or create a dedicated MySQL user for development

**Database Doesn't Exist:**
- Run `npm run setup` to create it automatically
- Or manually create: `CREATE DATABASE CostTracker_db;`

**Tables Don't Exist:**
- Run `npm run setup` to create all tables
- Or manually run: `mysql -u root -p < database/schema.sql`
