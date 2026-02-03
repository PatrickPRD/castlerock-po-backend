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
