# Castlerock PO Backend

Complete purchase order and worker management system for construction companies.

## 📚 Documentation

- **Quick Start (Local Development)**: See [QUICKSTART.md](QUICKSTART.md)
- **Production Deployment (AWS EC2 + RDS)**: See [AWS_EC2_RDS_DEPLOYMENT.md](AWS_EC2_RDS_DEPLOYMENT.md)
- **Multi-App Setup (Automated)**: Use `npm run setup-multi-app` to generate configuration files

## 🚀 Quick Start

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Update .env with your MySQL credentials
# 3. Initialize database
npm run setup

# 4. Start development server
npm run dev

# 5. Open http://localhost:3000
```

See [QUICKSTART.md](QUICKSTART.md) for detailed instructions.

### Production Deployment

For AWS EC2 with RDS MySQL, use the automated setup from your local machine:

```bash
# 1. Run the setup wizard locally
node setup-multi-app.js

# 2. When prompted, provide the SSH command
# ssh -i your-key.pem ec2-user@your-ec2-ip
```

This will interactively prompt for:
- App folder name (e.g., castlerock-po-v1)
- SSH command for connection
- Application name and port
- Database credentials
- Domain name
- **DNS verification** (confirm domain is pointing to EC2)
- SSL/HTTPS settings
- **Git branch** to deploy
- **AWS SES credentials** for email

Then follow the on-screen instructions to install services and start the application.

**Important**: Update your domain's DNS A record to point to the EC2 instance's public IP before running the wizard (especially if using HTTPS). The apps directory on EC2 is expected at `/apps`.

See [AWS_EC2_RDS_DEPLOYMENT.md](AWS_EC2_RDS_DEPLOYMENT.md) for manual setup or more details.

## 🛠 Available Scripts

```bash
npm run dev              # Start development server
npm run start            # Start production server
npm run setup            # Initialize database schema
npm run setup-multi-app  # Interactive multi-app configuration wizard
npm run migrate          # Run database migrations
npm run test-db          # Test database connection
npm run reset-db         # Reset database (⚠️ destructive)
npm run import-data      # Import sample data
npm run cleanup-test-data# Remove test data
```

## 📋 Features

- **Worker Management** - Track employees, safe pass certifications, timesheets
- **Purchase Orders** - Create, track, and manage POs with line items
- **Timesheets** - Record and manage worker hours
- **Reports** - Generate invoices, cost reports, labour analysis
- **Multi-Site Support** - Manage multiple construction sites
- **Role-Based Access** - Admin, manager, and worker roles
- **Admin Panel** - System configuration and user management

## 🗄 Database

- **MySQL** 5.7+ (local or RDS)
- Schema: `CostTracker_db` (auto-created)
- Migrations: Timestamp-based, located in `database/migrations/`

## 📦 Key Dependencies

- **Express.js** - Web framework
- **MySQL2** - Database driver
- **ExcelJS** - Excel generation
- **Puppeteer** - PDF generation
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Nodemailer** - Email sending

## 🔐 Prerequisites

### Local Development

1. **Node.js** (v18+)
2. **MySQL Server** (5.7+) running locally
3. **Git** for cloning the repository

### Production (AWS)

1. **EC2 instance** (Amazon Linux 2023)
2. **RDS MySQL instance** (5.7+)
3. **SSH access** to EC2
4. **Domain name** (optional, for SSL)

## 📖 Environment Configuration

Key environment variables in `.env`:

```env
# Application
NODE_ENV=development         # or 'production'
PORT=3000

# Database
DB_HOST=127.0.0.1           # or RDS endpoint
DB_NAME=CostTracker_db
DB_USER=admin
DB_PASSWORD=your_password
DB_PORT=3306

# Authentication
JWT_SECRET=your_random_secret_key

# AWS SES Email
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_iam_access_key
AWS_SECRET_ACCESS_KEY=your_iam_secret_key
AWS_SES_FROM_ADDRESS=noreply@yourdomain.com

# Application
APP_URL=http://localhost:3000
```

## 🔗 Deployment Guides

### Local Development
Follow [QUICKSTART.md](QUICKSTART.md) for step-by-step local setup.

### AWS EC2 + RDS Production
For production deployment to AWS:

1. **Automated Setup** (Recommended):
   ```bash
   npm run setup-multi-app
   ```
   This generates all configuration files interactively.

2. **Manual Setup**:
   See [AWS_EC2_RDS_DEPLOYMENT.md](AWS_EC2_RDS_DEPLOYMENT.md) for detailed instructions.

3. **Multi-App Installation**:
   Deploy multiple versions of the application on the same EC2 instance with separate ports, databases, and systemd services.

### Puppeteer / PDF Generation
If using PDF features on EC2, install Chromium dependencies:

```bash
sudo dnf update -y
sudo dnf install -y chromium
```

See [AWS_EC2_RDS_DEPLOYMENT.md](AWS_EC2_RDS_DEPLOYMENT.md#step-2-prepare-ec2-environment) for full dependency list.

## 🏗 Architecture

### Directory Structure

```
├── src/
│   ├── index.js                    # Express app entry point
│   ├── db.js                       # MySQL connection pool
│   ├── middleware/
│   │   ├── auth.js                 # JWT authentication
│   │   └── setupCheck.js           # Setup wizard gate
│   ├── routes/
│   │   ├── admin.js                # Admin API endpoints
│   │   ├── workers.js              # Worker management
│   │   ├── purchaseOrders.js       # PO endpoints
│   │   └── ...                     # Other routes
│   ├── services/
│   │   ├── setupWizardService.js   # Setup wizard logic
│   │   ├── pdfService.js           # PDF generation
│   │   └── ...                     # Other services
│   └── views/                      # EJS templates
├── public/
│   ├── js/                         # Client-side scripts
│   ├── css/                        # Stylesheets
│   └── assets/                     # Images, fonts, etc.
├── database/
│   ├── setup.js                    # Database initialization
│   ├── migrate.js                  # Run migrations
│   ├── migrations/                 # SQL migration files
│   └── seed.sql                    # Sample data
├── .env                            # Environment configuration
├── package.json                    # Dependencies
└── README.md                       # This file
```

### Technology Stack

- **Backend**: Express.js 5.x (Node.js)
- **Database**: MySQL 5.7+
- **Frontend**: EJS templates + Bootstrap 5 + Vanilla JS
- **PDF**: Puppeteer + Chromium
- **Excel**: ExcelJS
- **Auth**: JWT + bcrypt
- **Email**: Nodemailer

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Test connection
npm run test-db

# Check .env credentials are correct
cat .env | grep DB_
```

### Port Already in Use
```bash
# On Windows
netstat -ano | findstr :3000

# On macOS/Linux
lsof -i :3000
```

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Setup Wizard Not Appearing
- Only shows on first login before setup is complete
- To reset and re-run: `npm run reset-db` then `npm run setup`

## 📝 License

ISC

## 🤝 Support

For deployment issues, refer to:
- Local dev → [QUICKSTART.md](QUICKSTART.md)
- Production → [AWS_EC2_RDS_DEPLOYMENT.md](AWS_EC2_RDS_DEPLOYMENT.md)
- Multi-app → Run `npm run setup-multi-app`

