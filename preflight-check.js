#!/usr/bin/env node

/**
 * Preflight Check for EC2 Multi-App Setup
 * 
 * This script checks the EC2 instance and RDS for existing apps and databases
 * before running the setup-multi-app wizard.
 * 
 * Usage: npm run preflight-check
 * or: node preflight-check.js
 */

const { execSync } = require('child_process');
const readline = require('readline');
const mysql = require('mysql2/promise');

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise(resolve => {
    rl.question(`${colors.cyan}?${colors.reset} ${question} `, resolve);
  });
}

function escapeForSingleQuotes(value) {
  return value.replace(/'/g, `'"'"'`);
}

function parseSshCommand(sshCommand) {
  const parts = sshCommand.trim().split(/\s+/);
  if (parts[0] !== 'ssh' || parts.length < 2) {
    throw new Error('SSH command must start with "ssh" and include a target');
  }
  const target = parts[parts.length - 1];
  const options = parts.slice(1, -1);
  return { target, options };
}

function runSshCapture(sshBase, remoteCommand) {
  try {
    const escaped = escapeForSingleQuotes(remoteCommand);
    const fullCommand = `${sshBase} "bash -lc '${escaped}'"`;
    return execSync(fullCommand, { encoding: 'utf8' }).trim();
  } catch (error) {
    return null;
  }
}

async function checkEC2Apps(sshBase) {
  log.section('EC2 Application Folders');

  const appsCheck = runSshCapture(sshBase, 'ls -la /apps/ 2>/dev/null || echo "NONE"');
  
  if (!appsCheck || appsCheck === 'NONE') {
    log.warn('No /apps directory found on EC2');
    return [];
  }

  const folders = appsCheck
    .split('\n')
    .slice(3) // Skip header lines
    .filter(line => line.trim())
    .map(line => line.split(/\s+/).pop())
    .filter(f => f && f !== '.' && f !== '..');

  if (folders.length === 0) {
    log.success('No existing app folders found');
    return [];
  }

  log.warn(`Found ${folders.length} existing app folder(s):`);
  folders.forEach(app => {
    console.log(`  📁 ${app}`);
  });

  return folders;
}

async function checkSystemdServices(sshBase) {
  log.section('Systemd Services');

  const services = runSshCapture(sshBase, 'systemctl list-units --type=service --all | grep castlerock || echo "NONE"');
  
  if (!services || services === 'NONE') {
    log.success('No castlerock systemd services found');
    return [];
  }

  log.warn('Found castlerock systemd services:');
  services.split('\n').forEach(line => {
    if (line.trim()) {
      console.log(`  🔧 ${line.trim()}`);
    }
  });

  return services.split('\n').filter(l => l.trim());
}

async function checkPM2Apps(sshBase) {
  log.section('PM2 Applications');

  const pm2Check = runSshCapture(sshBase, 'pm2 list 2>/dev/null | grep castlerock || echo "NONE"');
  
  if (!pm2Check || pm2Check === 'NONE') {
    log.success('No castlerock PM2 apps found');
    return [];
  }

  log.warn('Found castlerock PM2 apps:');
  pm2Check.split('\n').forEach(line => {
    if (line.trim()) {
      console.log(`  ⚙️  ${line.trim()}`);
    }
  });

  return pm2Check.split('\n').filter(l => l.trim());
}

async function checkRDSDatabases(dbHost, dbUser, dbPassword, dbPort) {
  log.section('RDS Databases');

  try {
    const connection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      port: dbPort || 3306
    });

    const [databases] = await connection.query('SHOW DATABASES');
    await connection.end();

    const castlerockDbs = databases
      .map(db => db.Database)
      .filter(name => name.toLowerCase().includes('castlerock') || name === 'CostTracker_db');

    if (castlerockDbs.length === 0) {
      log.success('No castlerock databases found');
      return [];
    }

    log.warn(`Found ${castlerockDbs.length} castlerock database(s):`);
    castlerockDbs.forEach(db => {
      console.log(`  💾 ${db}`);
    });

    return castlerockDbs;
  } catch (error) {
    log.error(`Could not connect to RDS: ${error.message}`);
    return [];
  }
}

async function checkDatabaseUsers(dbHost, dbUser, dbPassword, dbPort) {
  log.section('Database Users Count');

  try {
    const connection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      port: dbPort || 3306
    });

    const castlerockDbs = ['CostTracker_db'];
    
    // Get all databases
    const [allDbs] = await connection.query('SHOW DATABASES');
    const allDbNames = allDbs.map(db => db.Database);
    
    // Add any castlerock-specific databases
    const dbsToCheck = [
      ...castlerockDbs,
      ...allDbNames.filter(name => name.includes('castlerock'))
    ];

    for (const dbName of dbsToCheck) {
      try {
        const [users] = await connection.query(`SELECT COUNT(*) as count FROM ${dbName}.users`);
        const count = users[0]?.count || 0;
        
        if (count > 0) {
          log.warn(`${dbName}: ${colors.red}${count} user(s) found${colors.reset}`);
        } else {
          log.success(`${dbName}: Empty (ready for setup)`);
        }
      } catch (err) {
        // Database or table doesn't exist
      }
    }

    await connection.end();
  } catch (error) {
    log.warn(`Could not check database users: ${error.message}`);
  }
}

async function checkRunningProcesses(sshBase) {
  log.section('Running Node Processes');

  const processes = runSshCapture(sshBase, 'ps aux | grep "node src/index.js" | grep -v grep || echo "NONE"');
  
  if (!processes || processes === 'NONE') {
    log.success('No running castlerock Node processes found');
    return;
  }

  log.warn('Found running Node processes:');
  processes.split('\n').forEach(line => {
    if (line.trim()) {
      console.log(`  ▶️  ${line.trim()}`);
    }
  });
}

async function main() {
  console.log(`
${colors.bright}${colors.cyan}╔════════════════════════════════════════════════╗${colors.reset}
${colors.bright}${colors.cyan}║   Castlerock PO - Preflight Check               ║${colors.reset}
${colors.bright}${colors.cyan}╚════════════════════════════════════════════════╝${colors.reset}
  `);

  try {
    const sshInput = await prompt('SSH command (e.g., ssh -i key.pem ec2-user@your-ec2-ip):');
    
    let sshInfo;
    try {
      sshInfo = parseSshCommand(sshInput);
    } catch (err) {
      log.error(err.message);
      rl.close();
      process.exit(1);
    }

    const sshBase = `ssh ${sshInfo.options.join(' ')} ${sshInfo.target}`.trim();

    log.success(`Connected to: ${sshInfo.target}\n`);

    // EC2 checks
    const appFolders = await checkEC2Apps(sshBase);
    await checkSystemdServices(sshBase);
    await checkPM2Apps(sshBase);
    await checkRunningProcesses(sshBase);

    // RDS checks
    const dbTest = await prompt('\n\nCheck RDS databases? (yes/no):');
    if (dbTest.toLowerCase().startsWith('y')) {
      const dbHost = await prompt('Database host (RDS endpoint):');
      const dbUser = await prompt('Database username:');
      const dbPassword = await prompt('Database password (will not echo):');
      const dbPort = await prompt('Database port (default 3306):');

      await checkRDSDatabases(dbHost, dbUser, dbPassword, dbPort || 3306);
      await checkDatabaseUsers(dbHost, dbUser, dbPassword, dbPort || 3306);
    }

    // Recommendations
    log.section('Recommendations for setup-multi-app');

    if (appFolders.length > 0) {
      log.warn(`${appFolders.length} app folder(s) already exist`);
      console.log(`  → Use a different app name to avoid conflicts`);
      console.log(`  → Suggested: castlerock-po-v${appFolders.length + 1}\n`);
    } else {
      log.success('No existing apps - safe to use any app name\n');
    }

    log.info('When running setup-multi-app:');
    console.log('  1. Use a unique app name (not matching existing folders)');
    console.log('  2. Choose "no" for shared database (use unique schema)');
    console.log('  3. Let the wizard auto-scan for available ports');
    console.log('  4. Confirm all settings before deployment\n');

    log.success('Preflight check complete! Ready to run setup-multi-app\n');

    rl.close();
  } catch (error) {
    log.error(`Preflight check failed: ${error.message}`);
    rl.close();
    process.exit(1);
  }
}

main();
