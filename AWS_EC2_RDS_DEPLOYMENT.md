# Castlerock PO Backend - AWS EC2 + RDS Deployment Guide

This guide covers deploying the Castlerock PO Backend application on an existing Amazon EC2 instance connected to an RDS MySQL database.

**Quick Start:** Use `node setup-multi-app.js` for automated configuration (recommended)

**Deploy Updates:** Use `node deploy-to-ec2.js` to deploy latest code changes to EC2

**Manual Setup:** Follow the steps below if you prefer manual configuration

## Quick Deployment of Updates

If your application is already running on EC2 and you want to deploy the latest code changes:

```bash
# From your local machine in the git repository root
npm run deploy

# Or run the script directly
node deploy-to-ec2.js
```

This automated script will:
- ✅ Connect to EC2 and list available apps
- ✅ Let you select which app to update
- ✅ Pull latest code from git repository
- ✅ Install/update npm dependencies
- ✅ Run database migrations (if any)
- ✅ Restart the application service
- ✅ Verify the service is running

You'll be prompted for:
1. SSH command (e.g., `ssh -i your-key.pem ec2-user@your-ec2-ip`)
2. Select from list of deployed apps (automatically detected)
3. Git branch to pull (default: `main`)

**Manual deployment** (if you prefer to run commands yourself):

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# Navigate to your app directory
cd /apps/castlerock-po-v1

# Pull latest code
git pull origin main

# Install dependencies
npm install --production

# Restart the service
sudo systemctl restart castlerock-po-v1

# Check status
sudo systemctl status castlerock-po-v1

# View recent logs
sudo journalctl -u castlerock-po-v1 -n 50
```

## Prerequisites

✅ **Already in place:**
- Working EC2 instance (Amazon Linux 2023 or similar)
- Working RDS MySQL instance (version 5.7+)
- SSH access to EC2 instance
- RDS connection details (endpoint, username, password)
- Security groups configured to allow EC2 ↔ RDS communication

ℹ️ **You will need:**
- SSH key file for EC2 access
- RDS database credentials
- RDS endpoint address

## Information Checklist

**Gather this information before running the setup script:**

### EC2 Instance & Network
- [ ] EC2 instance has a public IP or Elastic IP assigned
- [ ] Security group allows inbound traffic on ports 80 (HTTP) and 443 (HTTPS)
- [ ] SSH key file for accessing the instance
- [ ] App folder name (e.g., `castlerock-po-v1`)
- [ ] SSH command (e.g., `ssh -i your-key.pem ec2-user@your-ec2-ip`)

### Application Setup
- [ ] Application name (e.g., `castlerock-po-v1`)
- [ ] Port to start scanning from (default: 3000)

### Database Credentials
- [ ] RDS Endpoint (e.g., `my-db.us-east-1.rds.amazonaws.com`)
- [ ] Database Username (e.g., `admin`)
- [ ] Database Password
- [ ] Database Port (typically 3306)
- [ ] Database Schema: Shared (`CostTracker_db`) or Unique (`CostTracker_db_v2`)

### Domain & SSL
- [ ] Domain name (e.g., `castlerock-po.com` or `staging.castlerock-po.com`)
- [ ] Domain is accessible at this EC2 instance's IP? (yes/no)
  - If using HTTPS: **must** be set up before wizard runs
  - If using HTTP: can be done anytime
- [ ] Enable SSL/HTTPS? (yes/no)

### Git Repository
- [ ] Git branch (e.g., `main`, `develop`, `staging`)

### AWS SES Email Configuration
- [ ] AWS Region where SES is set up (e.g., `us-east-1`)
- [ ] IAM user with SES permissions created
- [ ] AWS Access Key ID (from IAM user)
- [ ] AWS Secret Access Key (from IAM user)
- [ ] Email address verified in AWS SES console (the "from" address)

**⚠️ Important SES Setup:**
- Create an IAM user with `AmazonSESFullAccess` policy (or SES-specific permissions)
- Verify at least one email address in SES console (this is your "from" address)
- Generate Access Key ID and Secret for the IAM user in IAM console

## Automated Setup with Script

For a faster setup experience, use the included **setup-multi-app.js** script which automates configuration file generation. This is the **recommended approach** for setting up new installations.

### Prerequisites

Before running the wizard script from your local machine, ensure:
- You have SSH access to the EC2 instance (`ssh` and `scp` available locally)
- You know the SSH connection command (e.g., `ssh -i key.pem ec2-user@your-ec2-ip`)
- The apps directory exists on EC2 at `/apps` (the script can create it)
- Git is installed on the EC2 instance (`git --version`)
- Node.js is installed on the EC2 instance (`node --version`)

### Running the Setup Wizard

Run the **setup-multi-app.js** script locally. It will connect to your EC2 instance over SSH and apply changes:

```bash
# From your local machine in the git repository root
node setup-multi-app.js
```

The script will prompt you for:
- App folder name (e.g., `castlerock-po-v1`)
- SSH command (e.g., `ssh -i your-key.pem ec2-user@your-ec2-ip`)
- App name, port, database, domain, SSL, branch, and AWS SES details

It will then:
- Create `/apps` on the EC2 instance if missing
- Clone the repository to `/apps/<appVersion>` (if you choose)
- Upload `.env`, systemd service, and Nginx config
- Optionally run `npm install` on the EC2 instance

The script will:
✅ Interactively ask for all required information
✅ **Auto-scan for available ports** and assign the next unused one
✅ Generate `.env` file
✅ Generate systemd service file
✅ Generate Nginx configuration
✅ Optionally clone the repository and run `npm install`
✅ Provide copy/paste instructions for deployment

### Required Information

**Before running the script, have the following ready:**

#### Application Information
- **Application name** (e.g., `castlerock-po-v1`, `castlerock-po-staging`)
- **Port scanning start** (default: 3000 - script finds next available)

#### Instance Information
- **App folder name** (e.g., `castlerock-po-v1`)
- **SSH command** (e.g., `ssh -i your-key.pem ec2-user@your-ec2-ip`)

#### Database Information
- **Database host** (RDS endpoint, e.g., `my-db.us-east-1.rds.amazonaws.com` or `localhost`)
- **Database username** (e.g., `admin`)
- **Database password** (RDS master password)
- **Database port** (default: 3306)
- **Database schema choice:**
  - Shared: Use `CostTracker_db` for all versions (recommended if sharing data)
  - Unique: Use separate schema like `CostTracker_db_v2` for isolation

#### Domain Information
- **Domain name** (e.g., `castlerock-po.com`, `staging.castlerock-po.com`)
- **DNS already pointing to EC2?** (required before HTTPS certificate setup)
- **SSL/HTTPS enabled?** (yes/no - requires valid certificate or Let's Encrypt setup)

#### Git Repository
- **Repository**: Fixed to `https://github.com/PatrickPRD/castlerock-po-backend`
- **Branch**: (e.g., `main`, `develop`, `staging`)
  - Script will prompt you to specify the branch to clone

#### AWS SES Email Configuration
- **AWS Region** (e.g., `us-east-1`, `eu-west-1`)
  - Must match the region where SES is set up
- **AWS Access Key ID** (from IAM user with SES permissions)
- **AWS Secret Access Key** (IAM user secret)
- **SES From Email Address** (must be verified in AWS SES console)

**⚠️ Important SES Prerequisites:**
1. Verify the "From" email address in your AWS SES console
2. Create an IAM user with `AmazonSESFullAccess` policy (or restricted SES permissions)
3. Generate Access Key ID and Secret for the IAM user
4. Store these credentials securely

### Script Output

The script generates three files locally and uploads them to EC2 under `/apps`:

1. **`.env`** - Application configuration (port, database, AWS SES credentials)
   - Location on EC2: `/apps/<appVersion>/.env`
   - Contains sensitive data (AWS credentials, database password)
   - **Already in the correct location** in the app directory

2. **`castlerock-po-*.service`** - Systemd service file
   - Location on EC2: `/apps/castlerock-po-<appVersion>.service`
   - Copy to: `/etc/systemd/system/`
   - Command: `sudo cp castlerock-po-<appVersion>.service /etc/systemd/system/`

3. **`nginx-*.conf`** - Nginx reverse proxy configuration
   - Location on EC2: `/apps/nginx-<appVersion>.conf`
   - Copy to: `/etc/nginx/conf.d/`
   - Command: `sudo cp nginx-<appVersion>.conf /etc/nginx/conf.d/castlerock-<appVersion>.conf`

### DNS Verification

During the wizard, you'll be asked to confirm that DNS is already pointing to the EC2 instance:
- **For HTTP (no SSL)**: DNS doesn't need to be set up yet
- **For HTTPS**: DNS **must** be pointing before generating SSL certificates

The wizard will show:
```
Domain & SSL Configuration:
    • Domain: castlerock-po.com
    • HTTPS Enabled: Yes
    • DNS Configured: Yes
```

### Example Output

After answering all prompts, the script outputs instructions like:

```
=== Next Steps ===

1. Install systemd service:
   sudo cp castlerock-po-v1.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable castlerock-po-v1.service

2. Install Nginx configuration:
   sudo cp nginx-v1.conf /etc/nginx/conf.d/castlerock-v1.conf
   sudo nginx -t
   sudo systemctl reload nginx

3. Start the application:
   sudo systemctl start castlerock-po-v1
   sudo systemctl status castlerock-po-v1

4. View logs (if needed):
   sudo journalctl -u castlerock-po-v1 -f

5. If using shared database schema (first time setup only):
   cd /apps/castlerock-po-v1
   npm run setup

6. Set up SSL Certificate (Let's Encrypt):
   DNS must be pointing to this server for Let's Encrypt to work
   sudo yum install -y certbot python3-certbot-nginx
   sudo certbot certonly --nginx -d castlerock-po.com -d www.castlerock-po.com
   
   Then update your Nginx config with the certificate paths...

Generated files in current directory:
   • castlerock-po-v1.service
   • nginx-v1.conf
   • .env

Access your application:
   • URL: https://castlerock-po.com
   • Dashboard: https://castlerock-po.com/
```

### Prerequisites for Running the Wizard

Before running the setup wizard, you should:

1. **Update DNS records** (if using a custom domain):
   - Point your domain's A record to this EC2 instance's public IP address
   - Allow a few minutes for DNS to propagate
   - If using HTTPS, this **must** be done before certificate generation

2. **Note your EC2 instance details**:
   - Public IP address or Elastic IP
   - SSH key file location
   - Security group allows ports 80/443

### Local Workflow (SSH)

```bash
# 1. Run the setup wizard locally
node setup-multi-app.js

# 2. Provide SSH command when prompted (example)
# ssh -i your-key.pem ec2-user@your-ec2-ip

# Follow the prompts:
#   - App name (e.g., castlerock-po-v1)
#   - Port (auto-detected)
#   - Database host, user, password, port
#   - Database schema (shared or unique)
#   - Domain name (e.g., castlerock-po.com)
#   - SSL enabled? (yes/no)
#   - DNS already pointing to this server? (yes/no)
#   - Git branch (e.g., main)
#   - AWS SES region, access key, secret key, from address

# 3. After wizard completes, run the generated SSH commands
#    to install systemd service, Nginx config, and start the app
# 4. Set up SSL certificate if HTTPS was enabled
# 5. View application logs if needed
```

## Manual Setup (Alternative)

If you prefer manual configuration or the script doesn't work in your environment, follow the steps below.

### Prerequisites for Manual Setup

- SSH access to EC2 instance
- Node.js 18+ installed
- Git installed
- Already in `/apps` directory or have created it

```bash
# Create apps directory if needed
sudo mkdir -p /apps
sudo chown ec2-user:ec2-user /apps
cd /apps
```

## Multi-App Installation Guide

This section explains how to run **multiple versions** of the Castlerock PO application on the same EC2 instance.

### Use Cases for Multiple Installations

- **Staging + Production**: Test new features in staging before deploying to production
- **Version Management**: Run v1 and v2 simultaneously for gradual migration
- **A/B Testing**: Run different versions for different users
- **Development Environment**: Maintain a development instance while keeping production stable

### Folder Structure

```
/apps/
├── castlerock-po-v1/          (Production version)
│   ├── src/
│   ├── public/
│   ├── .env                   (PORT=3000)
│   └── package.json
├── castlerock-po-v2/          (Staging/new version)
│   ├── src/
│   ├── public/
│   ├── .env                   (PORT=3001)
│   └── package.json
└── castlerock-po-staging/     (Development)
    ├── src/
    ├── public/
    ├── .env                   (PORT=3002)
    └── package.json
```

### Key Requirements for Multiple Installations

1. **Different PORT numbers** in each `.env` file (3000, 3001, 3002, etc.)
2. **Separate systemd services** (castlerock-po-v1.service, castlerock-po-v2.service, etc.)
3. **Nginx upstream blocks** routing traffic to different ports
4. **Optional: Separate database schemas** for data isolation (or shared schema for shared data)

### Setup Example

During the guide, when you see instructions to clone to one folder, you can instead clone to multiple:

```bash
# First version (production)
cd /apps
git clone https://github.com/yourusername/castlerock-po-backend.git castlerock-po-v1
cd castlerock-po-v1
# Set PORT=3000 in .env
npm install --production

# Second version (staging)
cd /apps
git clone https://github.com/yourusername/castlerock-po-backend.git castlerock-po-v2
cd castlerock-po-v2
# Set PORT=3001 in .env
npm install --production
```

Then continue with the rest of the guide, creating separate systemd services and Nginx configurations for each installation.

## Step 1: Connect to EC2 Instance

### 1.1 SSH into Your EC2 Instance

```bash
chmod 400 your-key-file.pem
ssh -i your-key-file.pem ec2-user@your-ec2-public-ip
```

Replace:
- `your-key-file.pem` - Your SSH private key
- `your-ec2-public-ip` - Your EC2 instance public IP (from AWS Console)

## Step 2: Prepare EC2 Environment

### 2.1 Install Required Software

```bash
# Update system
sudo yum update -y

# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
sudo yum install -y nodejs

# Install Git
sudo yum install -y git

# Install development tools (for native modules)
sudo yum install -y gcc g++ make python3
```

### 2.2 Install Puppeteer Dependencies (for PDF generation)

```bash
sudo yum install -y chromium
```

## Step 3: Deploy Application

### 3.1 Clone Repository (Multi-App Structure)

If you plan to run multiple versions of this application on the same EC2 instance, use an `apps` folder structure:

```bash
# Create apps directory if it doesn't exist
mkdir -p /apps

# Clone the repository with a version-specific folder name
# Examples: castlerock-po-v1, castlerock-po-v2, castlerock-po-staging, etc.
cd /apps
git clone https://github.com/yourusername/castlerock-po-backend.git castlerock-po-v1
cd castlerock-po-v1
```

**Note:** You can add multiple versions by cloning to different folders:
- `/apps/castlerock-po-v1` (production version)
- `/apps/castlerock-po-v2` (staging or newest version)  
- `/apps/castlerock-po-staging` (development builds)

Each version will run as a separate Node process with its own systemd service.

### 3.2 Install Node Dependencies

```bash
npm install --production
```

## Step 4: Configure Environment Variables

### 4.1 Create .env File

```bash
nano .env
```

Add the following configuration with your **RDS connection details**:

```env
# Application
NODE_ENV=production
PORT=3000

# Database Configuration (RDS)
DB_HOST=your-rds-endpoint.us-east-1.rds.amazonaws.com
DB_USER=your-rds-username
DB_PASSWORD=your-rds-password
DB_NAME=CostTracker_db
DB_PORT=3306

# JWT Secret (generate a random string for production)
JWT_SECRET=your-very-long-random-secret-key-change-this-in-production

# Email Configuration (optional - for password resets)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourcompany.com

# Application URL
APP_URL=http://your-ec2-public-ip:3000
```

**Replace:**
- `your-rds-endpoint.us-east-1.rds.amazonaws.com` - Your RDS endpoint
- `your-rds-username` - Your RDS master username
- `your-rds-password` - Your RDS master password
- `your-ec2-public-ip` - Your EC2 public IP address

### 4.2 Security Best Practices

#### Secure the .env File

```bash
chmod 600 .env
```

#### Use AWS Secrets Manager (Recommended for Production)

```bash
# Store database password
aws ssm put-parameter \
  --name /castlerock/db-password \
  --value "your-rds-password" \
  --type "SecureString" \
  --region us-east-1

# Store JWT secret
aws ssm put-parameter \
  --name /castlerock/jwt-secret \
  --value "your-jwt-secret" \
  --type "SecureString" \
  --region us-east-1
```

Then reference in .env:
```env
DB_PASSWORD=${/castlerock/db-password}
JWT_SECRET=${/castlerock/jwt-secret}
```

## Step 5: Initialize Database

**Note:** If you're running multiple versions of this app, you can:
- **Share a database schema** (single `CostTracker_db` for all versions) - recommended for shared data
- **Use separate schemas** (e.g., `CostTracker_db_v1`, `CostTracker_db_v2`) - for complete isolation

For shared schema setup (recommended), just update `DB_NAME` in all `.env` files to the same value.

### 5.1 Create Database Schema

```bash
npm run setup
```

This will:
- Create the `CostTracker_db` schema on your RDS instance
- Create all necessary tables
- Create a default super admin user

**⚠️ Default Admin Credentials** (change on first login!):
- Email: `admin@castlerock.com`
- Password: `Admin@123`

### 5.2 Verify Database Connection

```bash
npm run test-db
```

Expected output:
```
✅ Database connection successful
```

## Step 6: Systemd Service Configuration

### 6.1 Create Systemd Service File(s)

For **single app installation:**

```bash
sudo nano /etc/systemd/system/castlerock-po.service
```

For **multiple app installations**, create separate service files:

```bash
# Version 1
sudo nano /etc/systemd/system/castlerock-po-v1.service

# Version 2  
sudo nano /etc/systemd/system/castlerock-po-v2.service

# Staging
sudo nano /etc/systemd/system/castlerock-po-staging.service
```

### 6.2 Add Service Configuration

**Example for single app:**

```ini
[Unit]
Description=Castlerock PO Backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/apps/castlerock-po-v1
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
StandardOutput=inherit
StandardError=inherit
SyslogIdentifier=castlerock-po

[Install]
WantedBy=multi-user.target
```

**For multiple app versions**, create similar files with different names and `WorkingDirectory` paths:
- castlerock-po-v1.service → WorkingDirectory=/apps/castlerock-po-v1
- castlerock-po-v2.service → WorkingDirectory=/apps/castlerock-po-v2
- castlerock-po-staging.service → WorkingDirectory=/apps/castlerock-po-staging

**Important:** Make sure each app has a different `PORT` in its `.env` file (3000, 3001, 3002, etc.)

### 6.3 Enable and Start Service(s)

**For single app:**

```bash
sudo systemctl daemon-reload
sudo systemctl enable castlerock-po
sudo systemctl start castlerock-po
sudo systemctl status castlerock-po
```

**For multiple apps:**

```bash
sudo systemctl daemon-reload

# Enable and start each service
sudo systemctl enable castlerock-po-v1 castlerock-po-v2 castlerock-po-staging
sudo systemctl start castlerock-po-v1 castlerock-po-v2 castlerock-po-staging

# Check status
sudo systemctl status castlerock-po-v1
sudo systemctl status castlerock-po-v2
sudo systemctl status castlerock-po-staging

# View logs
sudo journalctl -u castlerock-po-v1 -f
sudo journalctl -u castlerock-po-v2 -f
```

## Step 7: Configure Nginx Reverse Proxy

### 7.1 Install and Start Nginx

```bash
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 7.2 Configure Nginx for Single App

```bash
sudo nano /etc/nginx/conf.d/castlerock.conf
```

Add:

```nginx
upstream castlerock_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Certificates (use AWS Certificate Manager or Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Proxy
    location / {
        proxy_pass http://castlerock_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for large file uploads
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 7.3 Configure Nginx for Multiple Apps

If running multiple versions, create separate upstream blocks and servers:

```bash
sudo nano /etc/nginx/conf.d/castlerock.conf
```

Add:

```nginx
# Define upstream servers  
upstream castlerock_v1 {
    server 127.0.0.1:3000;
}

upstream castlerock_v2 {
    server 127.0.0.1:3001;
}

upstream castlerock_staging {
    server 127.0.0.1:3002;
}

# Production v1
server {
    listen 80;
    server_name castlerock-po.com www.castlerock-po.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name castlerock-po.com www.castlerock-po.com;

    ssl_certificate /etc/letsencrypt/live/castlerock-po.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/castlerock-po.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        proxy_pass http://castlerock_v1;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Production v2 (different domain)
server {
    listen 80;
    server_name castlerock-po-v2.com www.castlerock-po-v2.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name castlerock-po-v2.com www.castlerock-po-v2.com;

    ssl_certificate /etc/letsencrypt/live/castlerock-po-v2.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/castlerock-po-v2.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        proxy_pass http://castlerock_v2;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# Staging version (can be subdomain of main domain)
server {
    listen 80;
    server_name staging.castlerock-po.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name staging.castlerock-po.com;

    ssl_certificate /etc/letsencrypt/live/castlerock-po.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/castlerock-po.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        proxy_pass http://castlerock_staging;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### 7.4 Test and Enable Nginx

```bash
# Test configuration
sudo nginx -t

# If successful, reload Nginx
sudo systemctl reload nginx

# Enable on startup
sudo systemctl enable nginx
```
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Step 8: SSL Certificate (Let's Encrypt)

### 8.1 Install Certbot

```bash
sudo yum install -y certbot python3-certbot-nginx
```

### 8.2 Get Certificate

```bash
sudo certbot certonly --nginx -d your-domain.com -d www.your-domain.com
```

### 8.3 Auto-Renewal

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## Step 9: Monitoring and Maintenance

### 9.1 CloudWatch Logs

Configure application logging to CloudWatch:

```bash
sudo yum install -y awslogs
```

### 9.2 Backups

Enable RDS automated backups in AWS Console:
- Backup retention: 7-30 days
- Backup window: Off-peak hours

Manual backup:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier castlerock-po-db \
  --db-snapshot-identifier castlerock-backup-$(date +%Y%m%d)
```

### 9.3 Health Checks

Monitor application health:

```bash
# Check application
curl https://your-domain.com/health

# Check PM2 status
pm2 status

# Check database connection
pm2 logs castlerock-po | grep -i "database"
```

## Troubleshooting

### Cannot Connect to RDS

1. Check security groups:
   ```bash
   # From EC2, test connection
   mysql -h castlerock-po-db.xxxxx.rds.amazonaws.com -u admin -p
   ```

2. Verify RDS is in same VPC as EC2

3. Check RDS security group allows inbound MySQL from EC2 security group

### Application Won't Start

1. Check logs:
   ```bash
   pm2 logs castlerock-po
   # or
   sudo journalctl -u castlerock-po -n 100
   ```

2. Verify .env file exists and has correct values:
   ```bash
   cat /home/ec2-user/app/.env
   ```

3. Test database connection:
   ```bash
   npm run test-connection
   ```

### High CPU/Memory Usage

1. Check Node.js process:
   ```bash
   top
   ```

2. View detailed logs:
   ```bash
   pm2 monit
   ```

## Step 10: Managing Multiple App Installations

If you've deployed multiple versions of the application (v1, v2, staging), use these commands for management:

### 10.1 Check Status of All Apps

```bash
# Check all services
sudo systemctl status castlerock-po-v1 castlerock-po-v2 castlerock-po-staging

# View all logs
sudo journalctl -u castlerock-po-v1 -f
sudo journalctl -u castlerock-po-v2 -f
sudo journalctl -u castlerock-po-staging -f
```

### 10.2 Start/Stop/Restart All Apps

```bash
# Start all
sudo systemctl start castlerock-po-v1 castlerock-po-v2 castlerock-po-staging

# Stop all
sudo systemctl stop castlerock-po-v1 castlerock-po-v2 castlerock-po-staging

# Restart all
sudo systemctl restart castlerock-po-v1 castlerock-po-v2 castlerock-po-staging

# Restart specific version
sudo systemctl restart castlerock-po-v1
```

### 10.3 Deploy Updates to One Version

Update and restart a specific version without affecting others:

```bash
# Pull latest changes for v2
cd /apps/castlerock-po-v2
git pull origin main
npm install --production

# Restart only v2
sudo systemctl restart castlerock-po-v2

# Check it started successfully
sudo systemctl status castlerock-po-v2
sudo journalctl -u castlerock-po-v2 -n 20
```

### 10.4 Monitor All Apps

```bash
# Watch all services in real-time
watch -n 1 'sudo systemctl status castlerock-po-v1 castlerock-po-v2 castlerock-po-staging'

# Check resource usage per app
ps aux | grep "node" | grep -v grep

# Check which ports are in use
sudo ss -tlnp | grep node
```

### 10.5 Database Management with Multiple Versions

**Shared Schema (Recommended):**
If all versions use the same database schema (`CostTracker_db`):
- All versions see the same data
- No database duplication
- Migrations affect all versions simultaneously

**Separate Schemas:**
For complete isolation, use different database names:

```env
# v1 .env
DB_NAME=CostTracker_db_v1

# v2 .env
DB_NAME=CostTracker_db_v2
```

Initialize each schema:
```bash
# For v1
cd /apps/castlerock-po-v1
npm run setup

# For v2
cd /apps/castlerock-po-v2
npm run setup
```

### 10.6 Gradual Migration Between Versions

To test before full migration:

```bash
# 1. Both versions running
sudo systemctl status castlerock-po-v1 castlerock-po-v2

# 2. Send traffic to new version in Nginx (change upstream or domain)
sudo nano /etc/nginx/conf.d/castlerock.conf
# Uncomment v2 server block, comment v1

# 3. Test thoroughly
# Open browser to staging.castlerock-po.com

# 4. When confident, update production server block
# Change upstream castlerock_backend to point to :3001 instead of :3000

# 5. Reload Nginx
sudo systemctl reload nginx

# 6. Monitor both versions
sudo journalctl -u castlerock-po-v1 -f
sudo journalctl -u castlerock-po-v2 -f

# 7. Once stable, stop old version
sudo systemctl stop castlerock-po-v1
```

### 10.7 Adding New Versions

To add another version without downtime:

```bash
# Clone new version
cd /apps
git clone https://github.com/yourusername/castlerock-po-backend.git castlerock-po-v3
cd castlerock-po-v3

# Edit .env with new port (3003)
nano .env
# PORT=3003

# Install dependencies
npm install --production

# Create systemd service
sudo nano /etc/systemd/system/castlerock-po-v3.service
# (Copy from v1 or v2, update WorkingDirectory and Description)

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable castlerock-po-v3
sudo systemctl start castlerock-po-v3

# Add Nginx upstream block and server block
sudo nano /etc/nginx/conf.d/castlerock.conf
# Add new upstream and server configuration

# Test Nginx config
sudo nginx -t

# Reload if OK
sudo systemctl reload nginx
```

### 10.8 Disk Space Monitoring

With multiple installations, monitor disk usage:

```bash
# Check disk space
df -h

# Check size of apps directory
du -sh /apps/*

# Clean node_modules if space is tight (reinstall with npm install)
cd /apps/castlerock-po-v1
rm -rf node_modules package-lock.json
npm install --production

# Remove old git history if very large
cd /apps/castlerock-po-v1
git gc --aggressive
```

3. Consider upgrading EC2 instance type

### Database Connection Timeout

1. Check RDS endpoint in .env

2. Verify network connectivity:
   ```bash
   nc -zv castlerock-po-db.xxxxx.rds.amazonaws.com 3306
   ```

3. Check RDS security group rules

## Production Checklist

- [ ] Change default admin password immediately
- [ ] Configure strong JWT_SECRET in .env
- [ ] Enable RDS automated backups (7+ days)
- [ ] Configure CloudWatch monitoring
- [ ] Set up SSL/TLS certificates
- [ ] Enable VPC security groups properly
- [ ] Disable public RDS accessibility
- [ ] Implement backup strategy
- [ ] Set up log rotation
- [ ] Configure email notifications for errors
- [ ] Enable EC2 monitoring and alarms
- [ ] Document database credentials in AWS Secrets Manager
- [ ] Set up CI/CD pipeline for deployments

## Scaling Considerations

For production with multiple users:

1. **Auto-scaling Group**: Use EC2 Auto Scaling
2. **Load Balancer**: Add Application Load Balancer (ALB)
3. **Read Replicas**: Create RDS read replicas for read-heavy workloads
4. **Caching**: Consider ElastiCache (Redis) for session storage
5. **CDN**: Use CloudFront for static assets

## Additional Resources

- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [AWS RDS Documentation](https://docs.aws.amazon.com/rds/)
- [Node.js Best Practices](https://nodejs.org/en/docs/guides/nodejs-performance-operations/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Nginx Documentation](https://nginx.org/en/docs/)

## Support

For issues or questions:
1. Check application logs
2. Review AWS CloudWatch logs
3. Test connectivity to RDS
4. Verify security group configurations
5. Contact AWS support for infrastructure issues

---

**Last Updated**: February 11, 2026
