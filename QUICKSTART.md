# 🚀 Quick Start Guide

## Step 1: Update MySQL Password

Open [.env](.env) and update the MySQL password:
```env
DB_PASSWORD=your_actual_mysql_root_password
```

## Step 2: Create Database and Tables

Run the setup script to create the database and super admin:
```bash
npm run setup
```

This will:
- Create the `castlerock_dev` database
- Create all required tables
- Seed a super admin user

**Default Admin Credentials:**
- 📧 Email: `admin@castlerock.com`
- 🔑 Password: `Admin@123`
- ⚠️ Change password after first login!

## Step 3: Start the Server

Press `F5` in VSCode or run:
```bash
npm run dev
```

## Step 4: Access the Application

Open http://localhost:3000 and login with the admin credentials above.

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
- Or manually create: `CREATE DATABASE castlerock_dev;`

**Tables Don't Exist:**
- Run `npm run setup` to create all tables
- Or manually run: `mysql -u root -p < database/schema.sql`
