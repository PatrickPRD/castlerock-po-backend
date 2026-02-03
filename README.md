# Castlerock PO Backend - Local Setup Guide

## Prerequisites

1. **Node.js** (v14 or higher)
2. **MySQL Server** running on `127.0.0.1:3306`
3. **Database**: `castlerock_dev`

## Quick Start (VSCode)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Database
The `.env` file is already configured for local development:
- **Host**: 127.0.0.1
- **Port**: 3306
- **Database**: castlerock_dev
- **User**: root
- **Password**: (empty - update if needed)

**Update the password** in `.env` if your MySQL root user has a password.

### 3. Create Database
Run this SQL in your MySQL client:
```sql
CREATE DATABASE IF NOT EXISTS castlerock_dev;
USE castlerock_dev;
-- Add your table creation scripts here
```

### 4. Run the Application

**Option A: Using VSCode Debugger** (Recommended)
1. Press `F5` or go to Run > Start Debugging
2. Select "Launch Server" configuration
3. Server will start with debugging enabled

**Option B: Using Terminal**
```bash
npm run dev
```

**Option C: Using npm start**
```bash
npm start
```

### 5. Access the Application
Open your browser to: http://localhost:3000

## Verify Setup

Test the health endpoint:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "OK",
  "database": "connected",
  "environment": "development"
}
```

## Environment Variables

The `.env` file contains all configuration. Key variables:

```env
DB_HOST=127.0.0.1
DB_NAME=castlerock_dev
PORT=3000
NODE_ENV=development
```

## Deployment to EC2 + RDS

When ready to deploy to AWS:

### 1. Update Environment Variables
Create `.env` on EC2 with production values:
```env
DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
DB_USER=admin
DB_PASSWORD=your_secure_password
DB_NAME=castlerock_po
NODE_ENV=production
```

### 2. Key Changes for Production
The app automatically adjusts based on `NODE_ENV`:
- **Development**: Binds to `127.0.0.1` (localhost only)
- **Production**: Binds to `0.0.0.0` (all interfaces for EC2)

### 3. On EC2 Instance
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
git clone <your-repo-url>
cd castlerock-po-backend

# Install dependencies
npm install

# Create .env with production values
nano .env

# Run with PM2 (recommended)
sudo npm install -g pm2
pm2 start src/index.js --name castlerock-po
pm2 startup
pm2 save

# Or run directly
npm start
```

### 4. Security Group Configuration
Allow inbound traffic on port 3000 (or your chosen port) in EC2 Security Group.

### 5. RDS Setup
- Create MySQL RDS instance
- Note the endpoint URL
- Configure security group to allow EC2 instance access
- Update `.env` with RDS endpoint

## Troubleshooting

**Database Connection Failed**
- Verify MySQL is running: `mysql -u root -p`
- Check database exists: `SHOW DATABASES;`
- Verify credentials in `.env`

**Port Already in Use**
- Change `PORT` in `.env` to a different value
- Or kill process using port 3000: `netstat -ano | findstr :3000`

**Module Not Found**
- Run `npm install` to install dependencies

## File Structure
```
├── src/
│   ├── index.js          # Main application entry
│   ├── db.js             # Database connection pool
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   └── middleware/       # Auth & authorization
├── public/               # Frontend files
├── .env                  # Environment configuration (local)
├── .env.example          # Template for .env
└── package.json          # Dependencies and scripts
```

## NPM Scripts

- `npm start` - Start server in current environment
- `npm run dev` - Start with development environment
- `npm run prod` - Start with production environment

## Support

For issues, check the health endpoint and verify database connectivity.
