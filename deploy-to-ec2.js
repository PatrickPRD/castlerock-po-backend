#!/usr/bin/env node

/**
 * Deploy Latest Code to EC2 Instance
 * 
 * This script automates deploying the latest code to your EC2 instance
 * by connecting via SSH, pulling latest changes, installing dependencies,
 * and restarting the application service.
 * 
 * Usage:
 *   node deploy-to-ec2.js
 * 
 * Prerequisites:
 *   - SSH access to the EC2 instance configured
 *   - Application already set up on EC2 using setup-multi-app.js
 *   - Git repository already cloned in /apps directory on EC2
 */

const { exec } = require('child_process');
const readline = require('readline');
const util = require('util');

const execPromise = util.promisify(exec);

// Helper function to execute commands with timeout
async function execWithTimeout(command, timeoutMs = 30000) {
  return Promise.race([
    execPromise(command, { maxBuffer: 1024 * 1024 * 10 }),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Command timed out')), timeoutMs)
    )
  ]);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Deploy Latest Code to EC2 Instance                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let sshCommand = '';
  let appVersion = '';
  let serviceName = '';
  let appPath = '';
  let branch = '';
  let allServices = []; // Store all available services for later use

  try {
    // Step 1: Get SSH connection info first
    sshCommand = await question('SSH command (e.g., ssh -i key.pem ec2-user@1.2.3.4): ');
    
    // Step 2: Discover all available apps on EC2
    console.log('\n📂 Scanning for deployed apps on EC2...');
    
    const appMap = new Map(); // Map to store app info: name -> { path, service }
    
    // 2a. Find apps from directory listings (simplified and faster)
    console.log('   • Checking /apps directory...');
    const dirListCommand = `${sshCommand} "find /apps /home/ec2-user/apps /home/*/apps -maxdepth 1 -type d 2>/dev/null | grep -v '^/apps$\\|^/home/ec2-user/apps$\\|^/home/.*/apps$' | head -n 50 || echo ''"`;
    
    try {
      const { stdout: dirOutput } = await execWithTimeout(dirListCommand, 10000);
      const dirs = dirOutput.trim().split('\n').filter(d => {
        const trimmed = d.trim();
        // Filter out empty, parent dirs, and files that look like configs
        return trimmed !== '' && 
               trimmed !== '*' && 
               !trimmed.endsWith('.conf') && 
               !trimmed.endsWith('.service') &&
               !trimmed.endsWith('.log') &&
               !trimmed.endsWith('.txt');
      });
      
      dirs.forEach(fullPath => {
        const appName = fullPath.split('/').pop();
        if (appName && !appMap.has(appName)) {
          appMap.set(appName, { path: fullPath, service: null });
        }
      });
      
      if (dirs.length > 0) {
        console.log(`   ✓ Found ${dirs.length} app director${dirs.length === 1 ? 'y' : 'ies'}`);
      }
    } catch (error) {
      console.log('   ℹ️  Could not scan directories (this is okay)');
    }
    
    // 2b. Find apps from systemd services (faster approach)
    console.log('   • Checking systemd services...');
    const serviceListCommand = `${sshCommand} "systemctl list-units --type=service --all --no-pager --plain --no-legend | awk '{print \\$1}' | grep -E '\\.service$' || echo ''"`;
    
    try {
      const { stdout: serviceOutput } = await execWithTimeout(serviceListCommand, 10000);
      allServices = serviceOutput.trim().split('\n').filter(s => s.trim() !== '' && s.endsWith('.service')).map(s => s.replace('.service', ''));
      
      console.log(`   ✓ Found ${allServices.length} total systemd service${allServices.length === 1 ? '' : 's'}`);
      
      // Strategy 1: Match by WorkingDirectory (most accurate but requires property to be set)
      const servicesToCheck = allServices.slice(0, 20);
      let workingDirMatches = 0;
      
      for (const serviceName of servicesToCheck) {
        const service = serviceName + '.service';
        const workingDirCommand = `${sshCommand} "systemctl show ${service} -p WorkingDirectory --value 2>/dev/null || echo ''"`;
        
        try {
          const { stdout: workingDir } = await execWithTimeout(workingDirCommand, 3000);
          const path = workingDir.trim();
          
          if (path && path !== '' && path !== '/' && !path.startsWith('[')) {
            const appName = path.split('/').pop() || serviceName;
            
            if (appMap.has(appName)) {
              appMap.get(appName).service = serviceName;
              workingDirMatches++;
            } else {
              // Check if this path matches any directory we found
              for (const [existingName, info] of appMap.entries()) {
                if (info.path === path || info.path.includes(appName)) {
                  info.service = serviceName;
                  workingDirMatches++;
                  break;
                }
              }
            }
          }
        } catch (err) {
          // Skip if we can't get working directory quickly
        }
      }
      
      // Strategy 2: Name-based matching (if WorkingDirectory matching didn't find services)
      let nameMatches = 0;
      for (const [appName, info] of appMap.entries()) {
        if (!info.service) {
          // Try to find a service that matches the app name
          const matchingService = allServices.find(svc => {
            const svcLower = svc.toLowerCase();
            const appLower = appName.toLowerCase();
            
            // Check various matching patterns
            return svcLower === appLower ||                    // Exact match
                   svcLower.includes(appLower) ||             // Service contains app name
                   appLower.includes(svcLower) ||             // App name contains service
                   appLower.replaceAll('_', '-').includes(svcLower) ||  // Replace underscores
                   svcLower.includes(appLower.replaceAll('-', '_'));    // Or vice versa
          });
          
          if (matchingService) {
            info.service = matchingService;
            nameMatches++;
          }
        }
      }
      
      if (workingDirMatches > 0 || nameMatches > 0) {
        console.log(`      ✓ Auto-detected ${workingDirMatches} by path, ${nameMatches} by name matching`);
      }
      
    } catch (error) {
      console.log('   ℹ️  Could not scan systemd services');
    }
    
    // 2c. Check for PM2 apps
    console.log('   • Checking PM2 apps...');
    let pm2Apps = [];
    const pm2ListCommand = `${sshCommand} "pm2 list --no-autorestart 2>/dev/null || echo 'PM2_NOT_FOUND'"`;
    
    try {
      const { stdout: pm2Output } = await execWithTimeout(pm2ListCommand, 10000);
      
      if (!pm2Output.includes('PM2_NOT_FOUND')) {
        // Parse PM2 list output to extract app names
        // PM2 output looks like:
        // │ 0   │ costtracker  │ fork   │ 0          │ online │ 0s  │ 0 MB │
        const lines = pm2Output.split('\n');
        pm2Apps = lines
          .filter(line => line.includes('online') || line.includes('stopped') || line.includes('errored'))
          .map(line => {
            const parts = line.split('│');
            if (parts.length > 2) {
              return parts[2].trim(); // App name is usually in column 2
            }
            return null;
          })
          .filter(app => app && app !== '' && !app.startsWith('App name'));
        
        if (pm2Apps.length > 0) {
          console.log(`   ✓ Found ${pm2Apps.length} PM2 app${pm2Apps.length === 1 ? '' : 's'}: ${pm2Apps.join(', ')}`);
          
          // Try to match PM2 apps to our discovered apps
          for (const [appName, info] of appMap.entries()) {
            if (!info.service) {
              const matchingPm2 = pm2Apps.find(pm2 => 
                pm2.toLowerCase().includes(appName.toLowerCase()) ||
                appName.toLowerCase().includes(pm2.toLowerCase())
              );
              if (matchingPm2) {
                info.pm2App = matchingPm2;
              }
            }
          }
        }
      } else {
        console.log('   ℹ️  PM2 not found on EC2');
      }
    } catch (error) {
      console.log('   ℹ️  Could not check PM2 apps');
    }
    
    // Convert map to array
    const apps = Array.from(appMap.entries()).map(([name, info]) => ({
      name,
      path: info.path,
      service: info.service,
      pm2App: info.pm2App
    }));
    
    if (apps.length === 0) {
      console.log('❌ No apps found on EC2.');
      console.log('   • Checked directories: /apps, /home/*/apps');
      console.log('   • No systemd services or PM2 apps detected');
      console.log('\n   Please run setup-multi-app.js first to deploy an application.\n');
      rl.close();
      return;
    }
    
    console.log('✅ Found the following apps:\n');
    apps.forEach((app, index) => {
      console.log(`   ${index + 1}. ${app.name}`);
      console.log(`      Path: ${app.path || 'unknown'}`);
      if (app.service) {
        console.log(`      Manager: systemd (${app.service})`);
      } else if (app.pm2App) {
        console.log(`      Manager: PM2 (${app.pm2App})`);
      } else {
        console.log('      Manager: not detected');
      }
      console.log('');
    });
    
    // Step 3: Select app to deploy
    const appChoice = await question(`Select app number to deploy (1-${apps.length}): `);
    const appIndex = parseInt(appChoice) - 1;
    
    if (appIndex < 0 || appIndex >= apps.length) {
      console.log('❌ Invalid selection.');
      rl.close();
      return;
    }
    
    const selectedApp = apps[appIndex];
    appVersion = selectedApp.name;
    appPath = selectedApp.path;
    
    // Step 4: Confirm or set service/PM2 app name
    let appManagerType = null; // Track whether it's 'systemd' or 'pm2'
    
    if (selectedApp.service) {
      console.log(`\n✅ Using detected systemd service: ${selectedApp.service}`);
      serviceName = selectedApp.service;
      appManagerType = 'systemd';
      const changeService = await question('Use different service? (press Enter to keep, or type service name): ');
      if (changeService.trim()) {
        serviceName = changeService.trim();
      }
    } else if (selectedApp.pm2App) {
      console.log(`\n✅ Using detected PM2 app: ${selectedApp.pm2App}`);
      serviceName = selectedApp.pm2App;
      appManagerType = 'pm2';
      const changePm2 = await question('Use different PM2 app? (press Enter to keep, or type app name): ');
      if (changePm2.trim()) {
        serviceName = changePm2.trim();
      }
    } else {
      console.log('\n⚠️  No app manager auto-detected for this app');
      console.log('   This could mean:');
      console.log('   • App is managed by PM2 (not listed above)');
      console.log('   • App uses a systemd service with different name');
      console.log('   • App is daemonized or in background process');
      console.log('   • App manager isn\'t installed on EC2\n');
      
      if (pm2Apps && pm2Apps.length > 0) {
        console.log('   💡 Available PM2 apps:');
        pm2Apps.forEach((pm2, idx) => {
          console.log(`      ${idx + 1}. ${pm2}`);
        });
        console.log('');
      }
      
      if (allServices && allServices.length > 0) {
        // Filter to services that might be related
        const likelyServices = allServices.filter(s => 
          s.toLowerCase().includes(appVersion.toLowerCase()) ||
          appVersion.toLowerCase().includes(s.toLowerCase()) ||
          s.toLowerCase().includes('node') ||
          s.toLowerCase().includes('app')
        );
        
        if (likelyServices.length > 0) {
          console.log('   💡 Possible systemd services:');
          likelyServices.slice(0, 10).forEach((s, idx) => {
            console.log(`      ${idx + 1}. ${s}`);
          });
          console.log('');
        }
      }
      
      console.log('   🔍 Debug commands on EC2:');
      console.log('      • PM2 apps: pm2 list');
      console.log('      • Node processes: ps aux | grep node');
      console.log('      • Systemd services: systemctl list-units --type=service --all | grep -i ' + appVersion.split('_')[0]);
      console.log('');
      
      serviceName = await question('Enter the PM2 app name or systemd service name (or press Enter to skip): ');
      if (!serviceName || serviceName.trim() === '') {
        console.log('\n⚠️  Deployment will continue without restarting the app manager.');
        console.log('   💡 You\'ll need to manually restart the application after deployment.');
        const continueWithout = await question('Continue without restart? (yes/no): ');
        if (continueWithout.toLowerCase() !== 'yes' && continueWithout.toLowerCase() !== 'y') {
          console.log('❌ Deployment cancelled.');
          rl.close();
          return;
        }
        serviceName = null; // Mark as no service
      }
    }
    
    // Step 5: Get git branch
    branch = await question('\nGit branch to pull (default: main): ') || 'main';
    
    // Verify path exists
    if (!appPath) {
      appPath = await question(`\nEnter app path (default: /apps/${appVersion}): `) || `/apps/${appVersion}`;
    }


    console.log('\n📋 Deployment Configuration:');
    console.log(`   • App: ${appVersion}`);
    console.log(`   • Path: ${appPath}`);
    console.log(`   • Service: ${serviceName || 'None (manual restart required)'}`);
    console.log(`   • Branch: ${branch}`);
    console.log(`   • SSH: ${sshCommand.split('@')[1] || 'EC2 Instance'}\n`);

    const confirm = await question('Continue with deployment? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Deployment cancelled.');
      rl.close();
      return;
    }

    console.log('\n🚀 Starting deployment...\n');

    // Step 1: Pull latest code
    console.log('📥 Step 1/5: Pulling latest code from git...');
    const pullCommand = `${sshCommand} "cd ${appPath} && git pull origin ${branch}"`;
    try {
      const { stdout: pullOutput } = await execWithTimeout(pullCommand, 30000);
      console.log(pullOutput);
    } catch (error) {
      console.error('❌ Git pull failed:', error.message);
      throw error;
    }

    // Step 2: Install dependencies
    console.log('📦 Step 2/5: Installing dependencies...');
    const installCommand = `${sshCommand} "cd ${appPath} && npm install --production"`;
    try {
      const { stdout: installOutput } = await execWithTimeout(installCommand, 120000);
      console.log('✅ Dependencies installed');
    } catch (error) {
      console.error('❌ npm install failed:', error.message);
      throw error;
    }
    // PDF rendering is browser-side (PDFKit), so no extra EC2 packages are needed.
    console.log('ℹ️  Skipping server PDF dependency checks (browser-side PDFKit).');
    // Step 3: Run database migrations (if any)
    console.log('🗄️  Step 3/5: Running database migrations...');
    const migrateCommand = `${sshCommand} "cd ${appPath} && npm run migrate 2>&1 || echo 'No migrations or migrate script not found'"`;
    try {
      const { stdout: migrateOutput } = await execWithTimeout(migrateCommand, 60000);
      console.log(migrateOutput);
    } catch (error) {
      console.log('ℹ️  No migrations run (this is normal if no migrate script exists)');
    }

    // Step 4: Restart the service (if service name provided)
    if (serviceName) {
      console.log('🔄 Step 4/5: Restarting application...');
      
      let restartCommand;
      if (appManagerType === 'pm2') {
        restartCommand = `${sshCommand} "pm2 restart ${serviceName}"`;
      } else {
        restartCommand = `${sshCommand} "sudo systemctl restart ${serviceName}"`;
      }
      
      try {
        await execWithTimeout(restartCommand, 15000);
        if (appManagerType === 'pm2') {
          console.log('✅ PM2 app restarted');
        } else {
          console.log('✅ Systemd service restarted');
        }
      } catch (error) {
        console.error('❌ Restart failed:', error.message);
        throw error;
      }

      // Step 5: Check service status
      console.log('🔍 Step 5/5: Checking status...');
      
      let statusCommand;
      if (appManagerType === 'pm2') {
        statusCommand = `${sshCommand} "pm2 show ${serviceName}"`;
      } else {
        statusCommand = `${sshCommand} "sudo systemctl status ${serviceName} --no-pager -l"`;
      }
      
      try {
        const { stdout: statusOutput } = await execWithTimeout(statusCommand, 10000);
        console.log(statusOutput);
      } catch (error) {
        // Status command may return non-zero even if running, so we'll show the output anyway
        if (error.stdout) {
          console.log(error.stdout);
        }
      }
    } else {
      console.log('⏭️  Step 4/5: Skipping restart (no service configured)');
      console.log('⏭️  Step 5/5: Skipping status check');
      console.log('\n⚠️  Remember to manually restart your application!');
    }

    console.log('\n✅ Deployment completed successfully!\n');
    console.log('📊 Next steps:');
    if (serviceName) {
      const sshBase = sshCommand.split(' ').slice(0, -1).join(' ');
      if (appManagerType === 'pm2') {
        console.log(`   • View logs: ${sshBase} "pm2 logs ${serviceName}"`);
        console.log(`   • Check status: ${sshBase} "pm2 show ${serviceName}"`);
        console.log(`   • Additional info: ${sshBase} "pm2 list"`);
      } else {
        console.log(`   • View logs: ${sshBase} "sudo journalctl -u ${serviceName} -f"`);
        console.log(`   • Check status: ${sshBase} "sudo systemctl status ${serviceName}"`);
      }
    } else {
      console.log(`   • SSH to server: ${sshCommand}`);
      console.log(`   • Navigate to app: cd ${appPath}`);
      console.log('   • Manually restart your application (e.g., pm2 restart, npm start, etc.)');
    }
    console.log('   • Test your application in the browser\n');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   • Check your SSH connection');
    console.log('   • Verify the app folder exists on EC2');
    console.log('   • Ensure git repository is initialized in the app folder');
    console.log('   • Check that the systemd service exists');
    if (serviceName) {
      console.log(`   • View service logs: sudo journalctl -u ${serviceName} -n 50`);
    }
    console.log('');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n❌ Deployment cancelled by user.');
  rl.close();
  process.exit(0);
});

main();
