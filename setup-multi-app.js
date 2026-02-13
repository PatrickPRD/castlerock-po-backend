#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.cyan}=== ${msg} ===${colors.reset}\n`)
};

/**
 * Escape single quotes for bash -lc
 */
function escapeForSingleQuotes(value) {
  return value.replace(/'/g, `'"'"'`);
}

/**
 * Parse SSH command into options and target
 */
function parseSshCommand(sshCommand) {
  const parts = sshCommand.trim().split(/\s+/);
  if (parts[0] !== 'ssh' || parts.length < 2) {
    throw new Error('SSH command must start with "ssh" and include a target');
  }
  const target = parts[parts.length - 1];
  const options = parts.slice(1, -1);
  return { target, options };
}

/**
 * Validate app name - must be alphanumeric with hyphens/underscores, 3-50 chars
 */
function validateAppName(name) {
  if (!name || name.length < 3 || name.length > 50) {
    return 'App name must be between 3 and 50 characters';
  }
  if (!/^[a-z0-9-_]+$/.test(name.toLowerCase())) {
    return 'App name can only contain lowercase letters, numbers, hyphens, and underscores';
  }
  if (/^-|^_/.test(name) || /-$|_$/.test(name)) {
    return 'App name cannot start or end with a hyphen or underscore';
  }
  return null;
}

/**
 * Extract user and host from SSH target
 */
function extractSshUserHost(target) {
  return target.includes('@') 
    ? target.split('@') 
    : ['ec2-user', target];
}

/**
 * Run an SSH command and return stdout
 */
function runSshCapture(sshBase, remoteCommand) {
  const escaped = escapeForSingleQuotes(remoteCommand);
  const fullCommand = `${sshBase} "bash -lc '${escaped}'"`;
  return execSync(fullCommand, { encoding: 'utf8' }).trim();
}

/**
 * Run an SSH command and stream output
 */
function runSshCommand(sshBase, remoteCommand) {
  const escaped = escapeForSingleQuotes(remoteCommand);
  const fullCommand = `${sshBase} "bash -lc '${escaped}'"`;
  execSync(fullCommand, { stdio: 'inherit' });
}

/**
 * Run an SCP command
 */
function runScpCommand(scpBase, localPath, remoteTargetPath) {
  const fullCommand = `${scpBase} "${localPath}" "${remoteTargetPath}"`;
  execSync(fullCommand, { stdio: 'inherit' });
}

/**
 * Get remote listening ports (with fallback checks)
 */
function getRemoteListeningPorts(sshBase) {
  try {
    const output = runSshCapture(
      sshBase,
      'ss -tlnH 2>/dev/null || netstat -tln 2>/dev/null || echo "Unable to scan ports"'
    );
    
    const ports = new Set();
    output.split(/\r?\n/).forEach((line) => {
      // Match various formats: :PORT or IP:PORT
      const match = line.match(/:(\d+)\s*(?:LISTEN|TIME_WAIT)?/i);
      if (match) {
        const port = parseInt(match[1], 10);
        if (port > 0 && port < 65536) {
          ports.add(port);
        }
      }
    });
    
    // Also check PM2 processes for ports they're using
    try {
      const pm2Output = runSshCapture(sshBase, 'pm2 list 2>/dev/null | grep -E "online|stopped"');
      // If PM2 is running, there are likely Node apps listening
      if (pm2Output && pm2Output.length > 0) {
        // PM2 is running - add common ports that might be in use
        // This is a safety measure as PM2 apps might not show in netstat on some systems
        ports.add(3000);
        ports.add(3001);
      }
    } catch (err) {
      // PM2 check is optional - ignore failures
    }
    
    return ports;
  } catch (err) {
    console.log(`${colors.yellow}⚠ Warning: Could not scan remote ports: ${err.message}${colors.reset}`);
    // Return empty set - will proceed but with warning
    return new Set();
  }
}

/**
 * Check if app already exists on remote server
 */
function checkAppExists(sshBase, appNameNormalized, appPath, pm2AppName) {
  try {
    // Check if PM2 app exists
    const pm2Check = runSshCapture(sshBase, `pm2 list 2>/dev/null | grep -q '${pm2AppName}' && echo 'exists' || echo 'not_found'`);
    const pm2Exists = pm2Check.trim() === 'exists';
    
    // Check if app folder exists
    const folderCheck = runSshCapture(sshBase, `test -d "${appPath}" && echo 'exists' || echo 'not_found'`);
    const folderExists = folderCheck.trim() === 'exists';
    
    return {
      pm2Exists,
      folderExists,
      appExists: pm2Exists || folderExists
    };
  } catch (err) {
    // If check fails, assume it doesn't exist
    return {
      pm2Exists: false,
      folderExists: false,
      appExists: false
    };
  }
}

/**
 * Find next available port on remote host
 */
function findAvailablePortRemote(startPort, usedPorts) {
  let port = startPort;
  while (usedPorts.has(port)) {
    port++;
  }
  return port;
}

/**
 * Prompt user for input
 */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`${colors.bright}? ${question}${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt user for password input (hidden)
 */
function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`${colors.bright}? ${question}${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Prompt yes/no question
 */
async function promptYesNo(question) {
  const answer = await prompt(`${question} (yes/no)`);
  return answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
}

/**
 * Validate required string input
 */
function requireValue(value, label) {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

/**
 * Detect placeholder DB host values that will fail
 */
function isPlaceholderDbHost(value) {
  if (!value) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'rds' || normalized === 'your-rds-endpoint' || normalized === 'your-rds-endpoint.us-east-1.rds.amazonaws.com';
}

/**
 * Generate random secret
 */
function generateRandomSecret() {
  return require('crypto').randomBytes(32).toString('hex');
}

/**
 * Generate .env file content
 */
function generateEnv(config) {
  return `# Application
NODE_ENV=production
PORT=${config.port}

# Database Configuration
DB_HOST=${config.dbHost}
DB_USER=${config.dbUser}
DB_PASSWORD=${config.dbPassword}
DB_NAME=${config.dbName}
DB_PORT=${config.dbPort}

# JWT Secret
JWT_SECRET=${config.jwtSecret || generateRandomSecret()}

# AWS SES Email Configuration
AWS_REGION=${config.awsRegion}
AWS_ACCESS_KEY_ID=${config.awsAccessKeyId}
AWS_SECRET_ACCESS_KEY=${config.awsSecretAccessKey}
AWS_SES_FROM_ADDRESS=${config.awsSesFromAddress}

# Application URL
APP_URL=${config.appUrl}
`;
}

/**
 * Generate systemd service file
 */
function generateSystemdService(config) {
  return `[Unit]
Description=Castlerock PO Backend - ${config.appName} (${config.instanceName})
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=${config.appPath}
EnvironmentFile=${config.appPath}/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
StandardOutput=inherit
StandardError=inherit
SyslogIdentifier=castlerock-po-${config.appNameNormalized}

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Generate Nginx upstream and server blocks (HTTP-only)
 */
function generateNginxConfigHttp(config) {
  const upstreamName = `castlerock_${config.appNameNormalized}`;

  return {
    upstream: `upstream ${upstreamName} {
    server 127.0.0.1:${config.port};
    keepalive 64;
}`,
    server: `server {
    listen 80;
    server_name ${config.domain} www.${config.domain};

    # Allow large file uploads for backups
    client_max_body_size 50M;

    location / {
        proxy_pass http://${upstreamName};
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
}`
  };
}

/**
 * Generate Nginx upstream and server blocks (HTTPS)
 */
function generateNginxConfigHttps(config) {
  const upstreamName = `castlerock_${config.appNameNormalized}`;

  return {
    upstream: `upstream ${upstreamName} {
    server 127.0.0.1:${config.port};
    keepalive 64;
}`,
    server: `# HTTP redirect to HTTPS
server {
    listen 80;
    server_name ${config.domain} www.${config.domain};
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 http2;
    server_name ${config.domain} www.${config.domain};

    ssl_certificate /etc/letsencrypt/live/${config.domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${config.domain}/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Allow large file uploads for backups
    client_max_body_size 50M;

    location / {
        proxy_pass http://${upstreamName};
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
}`
  };
}

/**
 * Check if database schema exists on remote RDS instance
 */
function checkSchemaExists(dbHost, dbUser, dbPassword, dbPort, dbName) {
  try {
    // Create a simple script to check schema existence via mysql
    const checkScript = `mysql --protocol=TCP -h "${dbHost}" -P "${dbPort}" -u "${dbUser}" -p"${dbPassword}" -N -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '${dbName}';" 2>/dev/null`;
    const result = execSync(checkScript, { encoding: 'utf8' }).trim();
    return result === '1';
  } catch (err) {
    // If check fails, assume it doesn't exist (safer)
    return false;
  }
}

/**
 * Main setup function
 */
async function main() {
  console.log(`
${colors.bright}${colors.cyan}╔════════════════════════════════════════════════╗${colors.reset}
${colors.bright}${colors.cyan}║   Castlerock PO - Multi-App Setup Wizard        ║${colors.reset}
${colors.bright}${colors.cyan}╚════════════════════════════════════════════════╝${colors.reset}
  `);

  try {
    // Step 1: Instance name with validation
    log.section('Application Configuration');

    let appName;
    let validationError;
    do {
      appName = await prompt('App name (e.g., castlerock-po-v1):');
      validationError = validateAppName(appName);
      if (validationError) {
        log.error(validationError);
      }
    } while (validationError);

    // Normalize to lowercase
    let appNameNormalized = appName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    
    // Set instanceName to the same as appName (consolidated from separate prompts)
    const instanceName = appName;
    
    const sshInput = await prompt('SSH command (e.g., ssh -i key.pem ec2-user@your-ec2-ip):');
    let sshInfo;

    try {
      sshInfo = parseSshCommand(sshInput);
    } catch (err) {
      log.error(err.message);
      process.exit(1);
    }

    const sshBase = `ssh ${sshInfo.options.join(' ')} ${sshInfo.target}`.trim();
    const scpBase = `scp ${sshInfo.options.join(' ')}`.trim();
    
    // Extract user and host from target (format: user@host)
    const [sshUser, ec2Host] = extractSshUserHost(sshInfo.target);

    log.success(`App name: ${appNameNormalized}`);
    log.success(`SSH Target: ${sshInfo.target}`);

    // Step 2: Process manager selection
    log.section('Process Manager');
    const usePm2 = await promptYesNo('Use PM2 to manage the app instead of systemd?');
    let pm2AppName = `castlerock-po-${appNameNormalized}`;

    log.success(`App folder: ${appNameNormalized}`);

    // Step 3: Find available port
    log.section('Port Configuration');
    const startPort = await prompt('Start scanning from port (default 3000):');
    const basePort = parseInt(startPort) || 3000;

    log.info(`Scanning remote instance for available ports starting from ${basePort}...`);
    let usedPorts = new Set();
    try {
      usedPorts = getRemoteListeningPorts(sshBase);
      if (usedPorts.size > 0) {
        const portsArray = Array.from(usedPorts).sort((a, b) => a - b).slice(0, 10);
        log.warn(`Ports already in use: ${portsArray.join(', ')}${usedPorts.size > 10 ? '...' : ''}`);
      }
    } catch (err) {
      log.warn('Unable to scan remote ports. Using the provided start port.');
      log.info(`Error: ${err.message}`);
    }
    
    const availablePort = findAvailablePortRemote(basePort, usedPorts);
    
    if (availablePort !== basePort && usedPorts.has(basePort)) {
      log.warn(`Port ${basePort} is already in use!`);
    }
    
    log.success(`✓ Using port: ${availablePort}`);

    // Step 3: Database configuration
    log.section('Database Configuration');

    const dbHost = await prompt('Database host (e.g., localhost or RDS endpoint):');
    const dbUser = await prompt('Database username:');
    const dbPassword = await promptPassword('Database password:');
    const dbPort = await prompt('Database port (default 3306):');
    const useSharedSchema = await promptYesNo('Use shared database schema? (yes=CostTracker_db, no=unique schema)');

    let dbName;
    if (useSharedSchema) {
      dbName = 'CostTracker_db';
      log.success('Using shared schema: CostTracker_db');
    } else {
      // Use the app name as the schema name for unique schemas
      dbName = appNameNormalized;
      log.success(`Using unique schema: ${dbName}`);
    }

    requireValue(appName, 'Application name');
    requireValue(dbHost, 'Database host');
    requireValue(dbUser, 'Database username');
    requireValue(dbPassword, 'Database password');
    requireValue(dbName, 'Database schema name');
    if (isPlaceholderDbHost(dbHost)) {
      log.error('Database host looks like a placeholder. Please provide the actual RDS endpoint.');
      process.exit(1);
    }

    // Check if schema already exists
    log.info(`Checking if schema "${dbName}" already exists...`);
    const schemaExists = checkSchemaExists(dbHost, dbUser, dbPassword, dbPort || 3306, dbName);
    
    if (schemaExists) {
      log.warn(`\n⚠️  WARNING: Database schema "${dbName}" already exists!`);
      log.warn(`This will DELETE ALL DATA in the "${dbName}" database and recreate it.`);
      console.log(`\n${colors.yellow}Existing schema will be destroyed:${colors.reset}`);
      console.log(`  • All tables will be dropped`);
      console.log(`  • All data will be lost`);
      console.log(`  • The schema will be recreated from scratch\n`);
      
      const confirmWipe = await promptYesNo(`Do you want to wipe and recreate "${dbName}"?`);
      
      if (!confirmWipe) {
        log.error('Setup cancelled by user.');
        process.exit(1);
      }
      
      log.warn(`Proceeding to wipe schema "${dbName}"...`);
    } else {
      log.success(`✓ Schema "${dbName}" does not exist - will be created fresh`);
    }

    // Step 4: Domain and URL configuration
    log.section('Domain Configuration');

    const domain = await prompt('Domain name (e.g., castlerock-po.com):');
    const sslEnabledAnswer = await promptYesNo('Enable SSL/HTTPS?');
    requireValue(domain, 'Domain name');

    const appUrl = sslEnabledAnswer ? `https://${domain}` : `http://${domain}`;
    log.success(`Application URL: ${appUrl}`);

    // Confirm DNS is already pointing to this EC2 instance
    log.section('DNS Configuration');
    console.log(`
${colors.bright}Important: DNS Setup${colors.reset}
Your application will be accessible at: ${colors.bright}${appUrl}${colors.reset}

${colors.yellow}⚠ Prerequisites:${colors.reset}
  • If using SSL (HTTPS): Your domain's DNS must be pointing to this EC2 instance's IP
  • Let's Encrypt requires the domain to be resolvable when setting up certificates
  • If SSL is disabled (HTTP): You can update DNS anytime
    `);

    const dnsConfigured = await promptYesNo(`Have you already updated DNS to point "${domain}" to this EC2 instance?`);
    if (!dnsConfigured) {
      log.warn(`Please update your DNS records before completing setup.`);
      log.info(`Point the A record for "${domain}" to your EC2 instance's public IP address.`);
      if (sslEnabledAnswer) {
        log.warn(`SSL certificate generation will fail if DNS is not pointing to this server.`);
      }
    } else {
      log.success(`DNS is configured. Ready to set up SSL certificates if needed.`);
    }

    // Step 5: Git branch configuration
    log.section('Git Repository Configuration');

    log.info('Repository: https://github.com/PatrickPRD/castlerock-po-backend');
    const gitBranch = await prompt('Git branch (default: main):');
    const branch = gitBranch.trim() || 'main';
    log.success(`Using branch: ${branch}`);

    // Step 6: AWS SES Email configuration
    log.section('AWS SES Email Configuration');

    const useSes = await promptYesNo('Configure AWS SES email settings now?');
    let awsRegion = '';
    let awsAccessKeyId = '';
    let awsSecretAccessKey = '';
    let awsSesFromAddress = '';

    if (useSes) {
      awsRegion = await prompt('AWS Region (e.g., us-east-1):');
      awsAccessKeyId = await prompt('AWS Access Key ID:');
      awsSecretAccessKey = await promptPassword('AWS Secret Access Key:');
      awsSesFromAddress = await prompt('SES From Email Address (verified in SES):');

      requireValue(awsRegion, 'AWS Region');
      requireValue(awsAccessKeyId, 'AWS Access Key ID');
      requireValue(awsSecretAccessKey, 'AWS Secret Access Key');
      requireValue(awsSesFromAddress, 'SES From Email Address');

      log.success(`AWS Region: ${awsRegion}`);
      log.success(`SES From Address: ${awsSesFromAddress}`);
    } else {
      log.warn('AWS SES not configured. Email features will be disabled until configured.');
    }

    // Step 8: File paths
    log.section('Installation Paths');

    const appsRoot = '/apps';
    let appsDir = path.posix.join(appsRoot, appNameNormalized);
    let serviceName = `castlerock-po-${appNameNormalized}.service`;
    let nginxConfFile = `/etc/nginx/conf.d/castlerock-${appNameNormalized}.conf`;

    log.info(`Application directory: ${appsDir}`);
    log.info(`Systemd service file: ${serviceName}`);
    log.info(`Systemd path: /etc/systemd/system/${serviceName}`);
    log.info(`Nginx config path: ${nginxConfFile}`);

    // Step 7: Review configuration
    log.section('Configuration Summary');

    const config = {
      appName,
      appNameNormalized,
      instanceName,
      usePm2,
      pm2AppName,
      sshBase,
      scpBase,
      sshTarget: sshInfo.target,
      appsRoot,
      port: availablePort,
      dbHost,
      dbUser,
      dbPassword,
      dbName,
      dbPort: dbPort || '3306',
      schemaExists,
      domain,
      appUrl,
      sslEnabled: sslEnabledAnswer,
      dnsConfigured,
      gitBranch: branch,
      awsRegion,
      awsAccessKeyId,
      awsSecretAccessKey,
      awsSesFromAddress,
      appPath: appsDir,
      serviceName,
      nginxConfFile
    };

    console.log(`
  ${colors.bright}App Configuration:${colors.reset}
    • Name: ${config.appName}
    • Version: ${config.appNameNormalized}
    • Port: ${config.port}
    • URL: ${config.appUrl}
    • Directory: ${config.appPath}

  ${colors.bright}Folder Configuration:${colors.reset}
    • Folder: ${config.instanceName}
    • SSH: ${sshInput}
    • Apps Root: ${config.appsRoot}

  ${colors.bright}Domain & SSL Configuration:${colors.reset}
    • Domain: ${config.domain}
    • HTTPS Enabled: ${config.sslEnabled ? 'Yes' : 'No'}
    • DNS Configured: ${config.dnsConfigured ? colors.green + 'Yes' + colors.reset : colors.yellow + 'No (will need to be updated)' + colors.reset}

  ${colors.bright}Database Configuration:${colors.reset}
    • Host: ${config.dbHost}
    • Port: ${config.dbPort}
    • User: ${config.dbUser}
    • Database: ${config.dbName}
    • Schema Status: ${config.schemaExists ? colors.yellow + 'Existing (will be wiped)' + colors.reset : colors.green + 'New (will be created)' + colors.reset}

  ${colors.bright}Git Configuration:${colors.reset}
    • Repository: https://github.com/PatrickPRD/castlerock-po-backend
    • Branch: ${config.gitBranch}

  ${colors.bright}AWS SES Configuration:${colors.reset}
    • Region: ${config.awsRegion || 'Not configured'}
    • From Address: ${config.awsSesFromAddress || 'Not configured'}

  ${colors.bright}Service Configuration:${colors.reset}
    • Process Manager: ${config.usePm2 ? 'PM2' : 'systemd'}
    • Systemd Service: ${config.usePm2 ? 'Not generated (PM2 selected)' : `/etc/systemd/system/${config.serviceName}`}
    • Nginx Config: ${config.nginxConfFile}
    `);

    const confirm = await promptYesNo('\nDoes this look correct?');
    if (!confirm) {
      log.error('Setup cancelled.');
      process.exit(0);
    }

    const cloneRepo = await promptYesNo('Clone repository on EC2?');

    // Step 9: Preflight checks to fail fast
    log.section('Preflight Checks');

    log.info('Testing SSH connectivity...');
    runSshCommand(sshBase, 'echo "SSH OK"');
    log.success('SSH connectivity OK.');

    log.info('Checking Node.js availability on EC2...');
    runSshCommand(sshBase, 'node --version');
    log.success('Node.js available.');

    if (cloneRepo) {
      log.info('Checking Git availability on EC2...');
      runSshCommand(sshBase, 'git --version');
      log.success('Git available.');
    }

    if (usePm2) {
      log.info('Ensuring PM2 is installed on EC2...');
      runSshCommand(sshBase, 'command -v pm2 >/dev/null || sudo npm install -g pm2');
      log.success('PM2 available.');
    }

    log.info('Validating database host resolution and port reachability...');
    const dbPortValue = dbPort || '3306';
    runSshCommand(sshBase, `getent hosts "${dbHost}" >/dev/null`);
    runSshCommand(sshBase, 'command -v nc >/dev/null || sudo yum install -y nmap-ncat');
    runSshCommand(sshBase, `nc -z -w 5 "${dbHost}" "${dbPortValue}"`);
    log.success('Database host reachable on port.');

    // Check if app already exists
    log.info('Checking if app already exists on remote server...');
    const appStatus = checkAppExists(sshBase, appNameNormalized, appsDir, pm2AppName);
    
    if (appStatus.appExists) {
      log.warn(`\n⚠️  WARNING: App "${appNameNormalized}" already exists on the remote server!`);
      if (appStatus.pm2Exists) {
        console.log(`  • PM2 app "${pm2AppName}" is registered`);
      }
      if (appStatus.folderExists) {
        console.log(`  • App folder exists at ${appsDir}`);
      }
      console.log(`\nOptions:`);
      console.log(`  1. Overwrite - Stop & delete existing app, then deploy new version`);
      console.log(`  2. Use different name - Choose a new app name and deploy with that`);
      console.log(`  3. Cancel - Exit without making changes`);
      
      const overwriteChoice = await prompt('Choose action (overwrite/rename/cancel):');
      
      if (overwriteChoice.toLowerCase() === 'overwrite') {
        log.warn('Will stop and remove existing app...');
        config.shouldOverwrite = true;
      } else if (overwriteChoice.toLowerCase() === 'rename' || overwriteChoice.toLowerCase() === 'r') {
        // Get new app name
        let newAppName;
        let newValidationError;
        do {
          newAppName = await prompt(`Enter new app name (current: ${appName}):`);
          newValidationError = validateAppName(newAppName);
          if (newValidationError) {
            log.error(newValidationError);
          }
        } while (newValidationError);
        
        // Update variables with new app name
        const newAppNameNormalized = newAppName.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
        const newPm2AppName = `castlerock-po-${newAppNameNormalized}`;
        const newAppPath = path.posix.join(appsRoot, newAppNameNormalized);
        const newServiceName = `castlerock-po-${newAppNameNormalized}.service`;
        const newNginxConfFile = `/etc/nginx/conf.d/castlerock-${newAppNameNormalized}.conf`;
        
        // Update module-level variables (used for file generation)
        appNameNormalized = newAppNameNormalized;
        pm2AppName = newPm2AppName;
        appsDir = newAppPath;
        serviceName = newServiceName;
        nginxConfFile = newNginxConfFile;
        
        // Update config object
        config.appName = newAppName;
        config.appNameNormalized = newAppNameNormalized;
        config.pm2AppName = newPm2AppName;
        config.appPath = newAppPath;
        config.serviceName = newServiceName;
        config.nginxConfFile = newNginxConfFile;
        
        log.success(`✓ App name updated to: ${newAppName}`);
        log.info(`New app path will be: ${newAppPath}`);
        config.shouldOverwrite = false;
      } else {
        log.error('Setup cancelled by user.');
        process.exit(0);
      }
    } else {
      log.success('✓ App does not exist. Will proceed with fresh deployment.');
      config.shouldOverwrite = false;
    }

    const runDbLoginCheck = await promptYesNo('Run MySQL login check now?');
    if (runDbLoginCheck) {
      log.info('Ensuring MySQL client is installed on EC2...');
      runSshCommand(sshBase, 'command -v mysql >/dev/null || sudo yum install -y mariadb105');
      
      log.info('Running MySQL login check...');
      // Create validation script to avoid complex quoting issues
      const validationScript = `#!/bin/bash
export MYSQL_PWD='${dbPassword}'
mysql --protocol=TCP -h "${dbHost}" -P "${dbPortValue}" -u "${dbUser}" -N -e "SELECT 'MySQL connection successful' AS status;"
exit_code=$?
if [ $exit_code -eq 0 ]; then
  echo "✓ MySQL login check succeeded"
  exit 0
else
  echo "✗ MySQL login failed with exit code $exit_code"
  exit 1
fi`;

      // Write script to temp location (use proper Windows/Unix temp paths)
      const localTempScriptPath = path.join(os.tmpdir(), `validate_mysql_login_${Date.now()}.sh`);
      fs.writeFileSync(localTempScriptPath, validationScript, { mode: 0o755 });
      
      // Transfer script to EC2
      const remoteTempScriptPath = `/tmp/validate_mysql_login_${Date.now()}.sh`;
      runScpCommand(scpBase, localTempScriptPath, `${sshUser}@${ec2Host}:${remoteTempScriptPath}`);
      
      // Execute validation script
      try {
        runSshCommand(sshBase, `bash ${remoteTempScriptPath}`);
        log.success('MySQL login check succeeded.');
      } catch (loginErr) {
        log.warn('MySQL login check failed. Verify credentials in your .env file.');
        log.info('The application will test the connection when it starts.');
      }
      
      // Cleanup temp scripts (non-fatal)
      try {
        fs.unlinkSync(localTempScriptPath);
        runSshCommand(sshBase, `rm -f ${remoteTempScriptPath}`);
      } catch (cleanupErr) {
        log.warn('Unable to clean up temporary files (this is OK)');
      }

      const checkDbExists = await promptYesNo('Verify database exists now?');
      if (checkDbExists) {
        log.info('Checking if database exists...');
        
        const dbValidationScript = `#!/bin/bash
export MYSQL_PWD='${dbPassword}'
db_exists=$(mysql --protocol=TCP -h "${dbHost}" -P "${dbPortValue}" -u "${dbUser}" -N -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '${dbName}';" 2>/dev/null)
if [ "$db_exists" == "1" ]; then
  echo "✓ Database '${dbName}' exists"
  exit 0
else
  echo "ℹ Database '${dbName}' not found (will be created during setup)"
  exit 1
fi`;

        const localDbTempScriptPath = path.join(os.tmpdir(), `validate_db_exists_${Date.now()}.sh`);
        fs.writeFileSync(localDbTempScriptPath, dbValidationScript, { mode: 0o755 });
        const remoteDbTempScriptPath = `/tmp/validate_db_exists_${Date.now()}.sh`;
        runScpCommand(scpBase, localDbTempScriptPath, `${sshUser}@${ec2Host}:${remoteDbTempScriptPath}`);
        
        try {
          runSshCommand(sshBase, `bash ${remoteDbTempScriptPath}`);
          log.success('Database exists.');
        } catch (dbCheckErr) {
          // Database doesn't exist yet - this is OK for new deployments
          log.info('Database will be created when you run "npm run setup" on EC2.');
        }
        
        try {
          fs.unlinkSync(localDbTempScriptPath);
          runSshCommand(sshBase, `rm -f ${remoteDbTempScriptPath}`);
        } catch (cleanupErr) {
          log.warn('Unable to clean up temporary database validation files (this is OK)');
        }
      }
    }

    // Step 10: Generate files locally
    log.section('Generating Configuration Files');

    const localWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), `castlerock-${appNameNormalized}-`));
    log.info(`Local work directory: ${localWorkDir}`);

    // Generate .env file
    const envContent = generateEnv(config);
    const envPath = path.join(localWorkDir, '.env');
    fs.writeFileSync(envPath, envContent);
    log.success(`Created .env file: ${envPath}`);

    // Generate systemd service file
    let serviceOutputPath = null;
    if (!config.usePm2) {
      const serviceContent = generateSystemdService(config);
      serviceOutputPath = path.join(localWorkDir, serviceName);
      fs.writeFileSync(serviceOutputPath, serviceContent);
      log.success(`Created systemd service file: ${serviceOutputPath}`);
    }

    // Generate Nginx configuration (HTTP or HTTPS based on config)
    let nginxConfig;
    if (config.sslEnabled) {
      nginxConfig = generateNginxConfigHttps(config);
    } else {
      nginxConfig = generateNginxConfigHttp(config);
    }
    const nginxOutputPath = path.join(localWorkDir, `nginx-${appNameNormalized}.conf`);
    fs.writeFileSync(nginxOutputPath, `${nginxConfig.upstream}\n\n${nginxConfig.server}\n`);
    log.success(`Created Nginx config: ${nginxOutputPath}`);
    if (config.sslEnabled) {
      log.info(`${colors.cyan}Note: HTTPS config will require certificates to be installed${colors.reset}`);
    }

    // Step 11: Remote setup steps
    log.section('Remote Setup Steps');

    // If overwriting, stop and remove existing app first
    if (config.shouldOverwrite) {
      log.section('Removing Existing App');
      
      if (appStatus.pm2Exists) {
        log.info(`Stopping and deleting PM2 app "${pm2AppName}"...`);
        try {
          runSshCommand(sshBase, `pm2 stop ${pm2AppName} 2>/dev/null || true`);
          runSshCommand(sshBase, `pm2 delete ${pm2AppName} 2>/dev/null || true`);
          runSshCommand(sshBase, `pm2 save 2>/dev/null || true`);
          log.success('PM2 app removed.');
        } catch (err) {
          log.warn(`Could not remove PM2 app: ${err.message}`);
        }
      }
      
      if (appStatus.folderExists) {
        log.info(`Deleting app folder at ${appsDir}...`);
        try {
          runSshCommand(sshBase, `rm -rf "${appsDir}"`);
          log.success('App folder removed.');
        } catch (err) {
          log.warn(`Could not remove app folder: ${err.message}`);
        }
      }
    }

    log.info('Creating apps directory on EC2...');
    runSshCommand(sshBase, `sudo mkdir -p ${appsRoot} && sudo chown ec2-user:ec2-user ${appsRoot}`);

    if (cloneRepo) {
      const repoUrl = 'https://github.com/PatrickPRD/castlerock-po-backend.git';
      try {
        log.info(`Cloning ${repoUrl} (branch: ${config.gitBranch}) into ${appsDir}...`);
        runSshCommand(
          sshBase,
          `if [ -d "${appsDir}/.git" ]; then echo "Repo already exists at ${appsDir}"; else git clone -b ${config.gitBranch} ${repoUrl} ${appsDir}; fi`
        );
        runSshCommand(sshBase, `test -f "${appsDir}/package.json"`);
        log.success('Repository clone step completed');
      } catch (err) {
        log.error(`Failed to clone repository: ${err.message}`);
        process.exit(1);
      }
    } else {
      log.info(`${colors.yellow}Note: You'll need to manually clone the repository on EC2`);
      log.info(`${colors.cyan}git clone -b ${config.gitBranch} https://github.com/PatrickPRD/castlerock-po-backend.git ${appsDir}${colors.reset}`);
    }

    log.info('Uploading .env, systemd, and Nginx config to EC2...');
    runScpCommand(scpBase, envPath, `${config.sshTarget}:${appsDir}/.env`);
    if (serviceOutputPath) {
      runScpCommand(scpBase, serviceOutputPath, `${config.sshTarget}:${appsRoot}/${serviceName}`);
    }
    runScpCommand(scpBase, nginxOutputPath, `${config.sshTarget}:${appsRoot}/nginx-${appNameNormalized}.conf`);

    log.info('Validating uploaded files on EC2...');
    runSshCommand(sshBase, `test -f "${appsDir}/.env"`);
    if (serviceOutputPath) {
      runSshCommand(sshBase, `test -f "${appsRoot}/${serviceName}"`);
    }
    runSshCommand(sshBase, `test -f "${appsRoot}/nginx-${appNameNormalized}.conf"`);
    log.success('Uploaded files verified on EC2.');

    const runNpmInstall = await promptYesNo('Run npm install on EC2?');
    if (runNpmInstall) {
      log.info('Running npm install on EC2...');
      runSshCommand(sshBase, `cd ${appsDir} && npm install --production`);
      log.success('npm install completed.');

      // Install Puppeteer system dependencies for PDF generation
      log.section('Installing Puppeteer System Dependencies');
      log.info('Installing system libraries required for PDF generation...');
      
      // Install in batches to handle partial failures gracefully
      const depBatches = [
        'atk at-spi2-atk cups-libs dbus-glib dbus-libs',
        'gdk-pixbuf2 glib2 glibc gnutls gtk3',
        'libcrypt libcurl libdatrie libdrm libgbm libgcc libgcrypt',
        'icu libpango libpng libstdc++',
        'libwayland-client libwayland-server libX11 libX11-xcb libxcb',
        'libxdamage libxext libxfixes libxkbcommon libxrandr',
        'libxrender libxshmfence libxss libxtst',
        'mesa-libEGL mesa-libgbm nspr nss pango zlib'
      ];
      
      let successCount = 0;
      const batchCount = depBatches.length;
      
      for (const batch of depBatches) {
        try {
          runSshCommand(sshBase, `sudo yum install -y ${batch}`);
          successCount++;
        } catch (batchErr) {
          // Log failed batch but continue with others
          log.warn(`Failed to install batch: ${batch.split(' ').slice(0, 2).join(' ')}...`);
        }
      }
      
      if (successCount === batchCount) {
        log.success('All Puppeteer system dependencies installed.');
      } else if (successCount > 0) {
        log.warn(`Installed ${successCount}/${batchCount} dependency batches.`);
        log.info('Some dependencies may be missing, but PDF generation might still work.');
      } else {
        log.warn('Could not install Puppeteer dependencies.');
        log.info('Try running manually on EC2: sudo yum install -y atk libgbm libX11 mesa-libEGL');
      }
    }

    // Step 12: Auto-install Nginx configuration
    log.section('Installing Nginx Configuration');
    log.info('Installing Nginx configuration on EC2...');
    try {
      runSshCommand(sshBase, `sudo cp ${appsRoot}/nginx-${appNameNormalized}.conf ${nginxConfFile}`);
      // Test nginx config
      try {
        runSshCommand(sshBase, 'sudo nginx -t');
        runSshCommand(sshBase, 'sudo systemctl reload nginx');
        log.success('Nginx configuration installed and reloaded.');
      } catch (nginxTestErr) {
        log.warn('Nginx test requires certificates for HTTPS config, or has syntax errors.');
        log.info('This is OK - will attempt to install certificates next.');
      }
    } catch (err) {
      log.warn(`Nginx installation warning: ${err.message}`);
    }

    // Step 12b: Auto-generate SSL certificates if enabled and DNS is ready
    if (config.sslEnabled) {
      log.section('SSL Certificate Generation');
      log.info(`Generating SSL certificates for ${config.domain}...`);
      try {
        // Check if DNS is resolving
        const dnsCheck = runSshCapture(sshBase, `nslookup ${config.domain} 8.8.8.8 2>&1 | head -5`);
        if (dnsCheck.includes('Non-existent domain') || dnsCheck.includes('NXDOMAIN') || dnsCheck.includes('can\'t find')) {
          log.error(`DNS is not resolving for ${config.domain}`);
          log.warn('Skipping automatic certificate generation.');
          log.info(`To create certificates manually later:`);
          console.log(`  ${colors.cyan}${sshBase} "sudo certbot certonly --nginx -d ${config.domain} -d www.${config.domain}"${colors.reset}`);
        } else {
          log.success(`DNS resolves for ${config.domain}`);
          // Install certbot
          log.info('Installing certbot...');
          runSshCommand(sshBase, 'sudo yum install -y certbot python3-certbot-nginx');
          
          // Generate certificate
          log.info(`Creating Let's Encrypt certificate for ${config.domain}...`);
          try {
            runSshCommand(sshBase, `sudo certbot certonly --nginx -d ${config.domain} -d www.${config.domain} --preferred-challenges http --non-interactive --agree-tos --email admin@${config.domain}`);
            log.success('SSL certificate created successfully!');
            
            // Test and reload nginx with new config
            log.info('Testing and reloading Nginx with SSL...');
            runSshCommand(sshBase, 'sudo nginx -t');
            runSshCommand(sshBase, 'sudo systemctl reload nginx');
            log.success('Nginx SSL configuration active!');
          } catch (certErr) {
            log.warn(`Certificate generation failed: ${certErr.message}`);
            log.info('You can try manually: sudo certbot certonly --nginx -d ' + config.domain);
          }
        }
      } catch (err) {
        log.warn(`SSL setup warning: ${err.message}`);
      }
    }

    // Step 13: Auto-install systemd service (if not using PM2)
    if (!config.usePm2) {
      log.section('Installing Systemd Service');
      log.info('Installing systemd service on EC2...');
      try {
        runSshCommand(sshBase, `sudo cp ${appsRoot}/${serviceName} /etc/systemd/system/`);
        runSshCommand(sshBase, 'sudo systemctl daemon-reload');
        runSshCommand(sshBase, `sudo systemctl enable ${serviceName}`);
        runSshCommand(sshBase, `sudo systemctl start ${serviceName}`);
        log.success('Systemd service installed, enabled, and started.');
      } catch (err) {
        log.warn(`Systemd service installation warning: ${err.message}`);
      }
    }

    if (config.usePm2) {
      const startPm2 = await promptYesNo('Start the app with PM2 now?');
      if (startPm2) {
        log.info('Configuring PM2 startup and starting app...');
        
        // PM2 startup requires sudo
        try {
          runSshCommand(sshBase, `sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user`);
        } catch (err) {
          log.warn(`PM2 startup configuration failed (this may require manual setup): ${err.message}`);
        }
        
        try {
          // Start PM2 with explicit PORT environment variable
          runSshCommand(sshBase, `cd ${appsDir} && PORT=${config.port} pm2 start src/index.js --name ${config.pm2AppName}`);
          runSshCommand(sshBase, 'pm2 save');
          log.success(`PM2 app started on port ${config.port} and saved.`);
        } catch (err) {
          log.error(`Failed to start app with PM2: ${err.message}`);
        }
      }
    }

    // Step 14: Database schema initialization (skip for unique schemas - let browser wizard handle it)
    if (!useSharedSchema) {
      log.section('Database Initialization');
      
      // If the schema exists and user confirmed wipe, drop it first
      if (config.schemaExists) {
        log.warn(`Dropping existing schema "${config.dbName}"...`);
        try {
          // Create a drop script
          const dropScript = `#!/bin/bash
export MYSQL_PWD='${config.dbPassword}'
mysql --protocol=TCP -h "${config.dbHost}" -P "${config.dbPort}" -u "${config.dbUser}" -N -e "DROP DATABASE IF EXISTS ${config.dbName}; CREATE DATABASE ${config.dbName};" 2>/dev/null
echo "✓ Schema dropped and recreated"`;
          
          const localDropScriptPath = path.join(os.tmpdir(), `drop_schema_${Date.now()}.sh`);
          fs.writeFileSync(localDropScriptPath, dropScript, { mode: 0o755 });
          
          const remoteDropScriptPath = `/tmp/drop_schema_${Date.now()}.sh`;
          runScpCommand(scpBase, localDropScriptPath, `${sshUser}@${ec2Host}:${remoteDropScriptPath}`);
          runSshCommand(sshBase, `bash ${remoteDropScriptPath}`);
          log.success(`Schema "${config.dbName}" wiped and recreated.`);
          
          // Cleanup
          try {
            fs.unlinkSync(localDropScriptPath);
            runSshCommand(sshBase, `rm -f ${remoteDropScriptPath}`);
          } catch (cleanupErr) {
            // Ignore
          }
        } catch (dropErr) {
          log.error(`Failed to drop existing schema: ${dropErr.message}`);
          process.exit(1);
        }
      }
      
      // Create database tables but remove default admin user so wizard appears
      log.info(`Creating database tables for unique schema: ${config.dbName}...`);
      try {
        // Run setup to create tables and initial data
        runSshCommand(sshBase, `cd ${appsDir} && npm run setup`);
        log.success(`Database tables created successfully.`);
        
        // Remove default admin user so browser wizard will appear on first access
        log.info('Removing default admin user to enable setup wizard...');
        runSshCommand(sshBase, `cd ${appsDir} && node clear-users.js`);
        log.success('Default admin removed.');
        
        log.info(`${colors.cyan}The setup wizard will appear when you first load the app in your browser.${colors.reset}`);
      } catch (err) {
        log.warn(`Database initialization warning: ${err.message}`);
        log.info(`You may need to manually run: cd ${appsDir} && npm run setup && node clear-users.js`);
      }
    } else {
      log.section('Database Initialization');
      log.info(`Initializing shared database schema: ${config.dbName}...`);
      try {
        runSshCommand(sshBase, `cd ${appsDir} && npm run setup`);
        log.success(`Database schema '${config.dbName}' initialized successfully.`);
      } catch (err) {
        log.warn(`Database initialization warning: ${err.message}`);
        log.info(`You may need to manually run: cd ${appsDir} && npm run setup`);
      }
    }

    // Step 14b: Verify app is listening on correct port
    log.section('Port Verification');
    try {
      log.info(`Checking if app is listening on port ${config.port}...`);
      const portCheckOutput = runSshCapture(sshBase, `ss -tlnp 2>/dev/null | grep -E ':(${config.port})\\s' || echo 'NOT_FOUND'`);
      
      if (portCheckOutput.includes(config.port.toString()) || portCheckOutput.includes('LISTEN')) {
        log.success(`✓ App is listening on port ${config.port}`);
      } else {
        log.warn(`App does not appear to be listening on port ${config.port}`);
        log.info(`If the app just started, it may take a few seconds. Try:`)
        console.log(`  ${colors.cyan}${sshBase} "ss -tlnp | grep node"${colors.reset}`);
      }
    } catch (err) {
      log.warn(`Could not verify port: ${err.message}`);
    }

    // Step 15: Final instructions
    log.section('Next Steps');

    console.log(`
${config.usePm2 ? `${colors.bright}1. Ensure PM2 is running on boot:${colors.reset}
  ${colors.cyan}${sshBase} "pm2 startup systemd -u ec2-user --hp /home/ec2-user"${colors.reset}
  ${colors.cyan}${sshBase} "pm2 save"${colors.reset}

${colors.bright}2. Start the application with PM2:${colors.reset}
  ${colors.cyan}${sshBase} "cd ${appsDir} && pm2 start src/index.js --name ${config.pm2AppName}"${colors.reset}
  ${colors.cyan}${sshBase} "pm2 status"${colors.reset}
` : `${colors.bright}1. Install systemd service:${colors.reset}
  ${colors.cyan}${sshBase} "sudo cp ${appsRoot}/${serviceName} /etc/systemd/system/"${colors.reset}
  ${colors.cyan}${sshBase} "sudo systemctl daemon-reload"${colors.reset}
  ${colors.cyan}${sshBase} "sudo systemctl enable ${serviceName}"${colors.reset}
`}

${colors.bright}${config.usePm2 ? '3' : '2'}. Install Nginx configuration:${colors.reset}
  ${colors.cyan}${sshBase} "sudo cp ${appsRoot}/nginx-${appNameNormalized}.conf ${nginxConfFile}"${colors.reset}
  ${colors.cyan}${sshBase} "sudo nginx -t"${colors.reset}
  ${colors.cyan}${sshBase} "sudo systemctl reload nginx"${colors.reset}

${config.usePm2 ? '' : `${colors.bright}3. Start the application:${colors.reset}
  ${colors.cyan}${sshBase} "sudo systemctl start ${serviceName}"${colors.reset}
  ${colors.cyan}${sshBase} "sudo systemctl status ${serviceName}"${colors.reset}
`}

${colors.bright}${config.usePm2 ? '4' : '4'}. View logs (if needed):${colors.reset}
  ${colors.cyan}${sshBase} "${config.usePm2 ? 'pm2 logs' : `sudo journalctl -u ${serviceName} -f`}"${colors.reset}

${colors.bright}5. Setup Wizard:${colors.reset}
   ${colors.green}✓ For unique schemas: Wizard will appear when you load the app in your browser${colors.reset}
   ${colors.cyan}For shared schemas: The database was auto-initialized with a default admin${colors.reset}
${useSharedSchema ? `
   To run the setup wizard on the shared database:
  ${colors.cyan}${sshBase} "cd ${appsDir} && npm run setup"${colors.reset}
` : ''}
${config.sslEnabled ? `
${colors.bright}6. SSL Certificate Setup:${colors.reset}
   ${colors.green}✓ Certificate generation was attempted during setup${colors.reset}
   
   If DNS wasn't ready, manually create the certificate:
  ${colors.cyan}${sshBase} "sudo certbot certonly --nginx -d ${config.domain} -d www.${config.domain}"${colors.reset}
   
   Then reload Nginx:
  ${colors.cyan}${sshBase} "sudo nginx -t && sudo systemctl reload nginx"${colors.reset}

   Enable auto-renewal:
    ${colors.cyan}${sshBase} "sudo systemctl enable certbot.timer && sudo systemctl start certbot.timer"${colors.reset}
` : ''}
${colors.bright}Generated files (local temp) and copied to EC2:${colors.reset}
${config.usePm2 ? '' : `  • ${serviceName} (copied to ${appsRoot}/)
`}${`  • nginx-${appNameNormalized}.conf (copied to ${appsRoot}/)  
  • .env (copied to ${appsDir}/.env)
`}

${colors.bright}Access your application:${colors.reset}
   • URL: ${config.appUrl}
   • Dashboard: ${config.appUrl}/
    `);

    log.success('Setup wizard completed successfully!');

  } catch (err) {
    log.error(`Setup failed: ${err.message}`);
    process.exit(1);
  }
}

// Run the wizard
main().catch((err) => {
  log.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
