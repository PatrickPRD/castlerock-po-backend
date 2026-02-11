# Castlerock PO Backend - AWS EC2 + RDS Deployment Guide

This guide covers deploying the Castlerock PO Backend application on Amazon EC2 with RDS MySQL database.

## Prerequisites

- AWS Account with appropriate permissions
- Basic understanding of AWS EC2 and RDS
- SSH client (for accessing EC2 instances)
- Git installed locally (to clone the repository)

## Step 1: Create RDS MySQL Database

### 1.1 Create RDS Instance

1. Go to [AWS RDS Console](https://console.aws.amazon.com/rds/)
2. Click **Create database**
3. Select **MySQL** as the engine
4. Choose **MySQL 8.0.x** (latest stable)
5. Select **Free tier** template (or appropriate tier for production)
6. Configure Database Details:
   - **DB instance identifier**: `castlerock-po-db`
   - **Master username**: `admin`
   - **Master password**: Choose a strong password (save this!)
   - **DB instance class**: `db.t3.micro` (free tier) or higher for production
   - **Storage**: `20 GB` (adjust for your needs)

7. Configure Connectivity:
   - **VPC**: Use default VPC or select your VPC
   - **Public accessibility**: **No** (keep it private)
   - **VPC security group**: Create new or select existing
     - **Security group name**: `castlerock-rds-sg`
   - **Availability zone**: Default or specify

8. Additional Configuration:
   - **Initial database name**: `castlerock_prod`
   - **Parameter group**: Default
   - **Option group**: Default
   - **Backup retention**: 7 days (adjust as needed)
   - **Monitoring**: Enable Enhanced monitoring (optional)

9. Click **Create database** and wait for it to become available (5-10 minutes)

### 1.2 Note RDS Endpoint

Once the database is created:
1. Go to RDS Databases
2. Click your database instance
3. Note the **Endpoint** (e.g., `castlerock-po-db.xxxxxxxxxx.us-east-1.rds.amazonaws.com`)

## Step 2: Launch EC2 Instance

### 2.1 Create EC2 Instance

1. Go to [AWS EC2 Console](https://console.aws.amazon.com/ec2/)
2. Click **Launch instance**
3. Select **Amazon Linux 2023** AMI (free tier eligible)
4. Instance type: `t3.micro` (free tier) or `t3.small` for production
5. **Network settings**:
   - VPC: Same VPC as RDS
   - Public IP: **Enable** (to access the application)
   - Security group: Create new
     - **Name**: `castlerock-app-sg`
     - **Allow inbound**:
       - HTTP (port 80) from anywhere
       - HTTPS (port 443) from anywhere
       - SSH (port 22) from your IP

6. **Configure storage**: 20 GB gp3 (default is fine)

7. **Advanced details**: User data script (see section 2.2)

8. Click **Launch instance** and create/use existing key pair for SSH access

### 2.2 User Data Script (Optional but Recommended)

Add this script to automate initial setup:

```bash
#!/bin/bash
set -e

# Update system
yum update -y

# Install Node.js 18.x
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# Install Git
yum install -y git

# Install development tools (for native modules)
yum install -y gcc g++ make python3

# Create app directory
mkdir -p /home/ec2-user/app
cd /home/ec2-user/app

# Clone repository
git clone https://github.com/yourusername/castlerock-po-backend.git .

# Install dependencies
npm install --production

# Set proper permissions
chown -R ec2-user:ec2-user /home/ec2-user/app
```

### 2.3 Configure Security Groups

**RDS Security Group** (`castlerock-rds-sg`):
- **Inbound Rule**:
  - Type: MySQL/Aurora
  - Port: 3306
  - Source: `castlerock-app-sg` (EC2 security group)

**EC2 Security Group** (`castlerock-app-sg`):
- **Inbound Rules**:
  - Type: HTTP, Port: 80, Source: 0.0.0.0/0
  - Type: HTTPS, Port: 443, Source: 0.0.0.0/0
  - Type: SSH, Port: 22, Source: Your IP/0.0.0.0/0

## Step 3: Connect to EC2 and Deploy Application

### 3.1 Connect via SSH

```bash
chmod 400 your-key-file.pem
ssh -i your-key-file.pem ec2-user@your-ec2-public-ip
```

### 3.2 Clone Repository

```bash
cd /home/ec2-user
git clone https://github.com/yourusername/castlerock-po-backend.git app
cd app
```

### 3.3 Install Dependencies

```bash
npm install --production
```

For PDF generation support, install Puppeteer dependencies:

```bash
# Install Chrome/Chromium dependencies
sudo yum install -y chromium
npx puppeteer browsers install chrome
```

## Step 4: Configure Environment Variables

### 4.1 Create .env File

```bash
cd /home/ec2-user/app
nano .env
```

Add the following configuration:

```env
# Application
NODE_ENV=production
PORT=3000

# Database Configuration (RDS)
DB_HOST=castlerock-po-db.xxxxxxxxxx.us-east-1.rds.amazonaws.com
DB_USER=admin
DB_PASSWORD=your-strong-password-here
DB_NAME=castlerock_prod
DB_PORT=3306

# JWT Secret (generate a random string)
JWT_SECRET=your-very-long-random-secret-key-change-this-in-production

# Optional: Email Configuration (for password resets)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASSWORD=your-email-password
# SMTP_FROM=noreply@yourcompany.com
```

**Important Security Note**: Use AWS Secrets Manager or Parameter Store for sensitive data in production:

```bash
aws ssm put-parameter \
  --name /castlerock/db-password \
  --value "your-password" \
  --type "SecureString" \
  --region us-east-1
```

### 4.2 Secure the .env File

```bash
chmod 600 .env
```

## Step 5: Initialize Database

### 5.1 Create Database Schema

```bash
npm run setup
```

This will:
- Create all necessary tables
- Create default super admin user
- Seed initial settings

**Default Admin Credentials** (change these on first login!):
- Email: `admin@castlerock.com`
- Password: `Admin@123`

### 5.2 Verify Database Connection

```bash
npm run test-db
```

Or manually test:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "OK",
  "database": "connected",
  "environment": "production"
}
```

## Step 6: Run Application

### 6.1 Simple Start (Development)

```bash
npm start
```

### 6.2 Production-Ready with PM2

Install PM2 globally:

```bash
sudo npm install -g pm2
```

Start application:

```bash
pm2 start npm --name "castlerock-po" -- start
pm2 save
sudo pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

Check status:

```bash
pm2 status
pm2 logs castlerock-po
```

### 6.3 Using systemd (Alternative)

Create service file:

```bash
sudo nano /etc/systemd/system/castlerock-po.service
```

Add:

```ini
[Unit]
Description=Castlerock PO Backend
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/app
ExecStart=/usr/bin/node /home/ec2-user/app/src/index.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"
Environment="PATH=/home/ec2-user/app/node_modules/.bin"

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable castlerock-po
sudo systemctl start castlerock-po
sudo systemctl status castlerock-po
```

View logs:

```bash
sudo journalctl -u castlerock-po -f
```

## Step 7: Configure Reverse Proxy (Nginx)

For production, use Nginx as a reverse proxy on port 80/443:

### 7.1 Install Nginx

```bash
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 7.2 Configure Nginx

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
