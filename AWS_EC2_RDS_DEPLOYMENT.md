# Castlerock PO Backend - AWS EC2 + RDS Deployment Guide

This guide covers deploying the Castlerock PO Backend application on an existing Amazon EC2 instance connected to an RDS MySQL database.

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

### 3.1 Clone Repository

```bash
cd /home/ec2-user
git clone https://github.com/yourusername/castlerock-po-backend.git app
cd app
```

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

## Step 6: Run the Application

### 6.1 Start Application

```bash
npm start
```

You should see:
```
✅ Server running on port 3000
✅ Database connected to CostTracker_db
```

### 6.2 Test Application

Open in browser:
```
http://your-ec2-public-ip:3000
```

You should be redirected to the Setup Wizard (first-time setup) or login page.

## Step 7: Production Setup (Optional but Recommended)

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
