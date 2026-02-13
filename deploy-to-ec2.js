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

  try {
    // Step 1: Get SSH connection info first
    sshCommand = await question('SSH command (e.g., ssh -i key.pem ec2-user@1.2.3.4): ');
    
    // Step 2: Discover all available apps on EC2
    console.log('\n📂 Scanning for deployed apps on EC2...');
    console.log('   Looking for apps in multiple locations and services...\n');
    
    const appMap = new Map(); // Map to store app info: name -> { path, service }
    
    // 2a. Find apps from directory listings
    const dirListCommand = `${sshCommand} "find /apps /home/*/apps /opt/apps -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -u || echo ''"`;
    
    try {
      const { stdout: dirOutput } = await execPromise(dirListCommand);
      const dirs = dirOutput.trim().split('\n').filter(d => d.trim() !== '');
      
      dirs.forEach(fullPath => {
        const appName = fullPath.split('/').pop();
        if (appName && !appMap.has(appName)) {
          appMap.set(appName, { path: fullPath, service: null });
        }
      });
    } catch (error) {
      console.log('   ℹ️  Could not scan directories');
    }
    
    // 2b. Find apps from systemd services
    const serviceListCommand = `${sshCommand} "systemctl list-units --type=service --all --no-pager --plain --no-legend | awk '{print \\$1}' | grep -v '@' || echo ''"`;
    
    try {
      const { stdout: serviceOutput } = await execPromise(serviceListCommand);
      const services = serviceOutput.trim().split('\n').filter(s => s.trim() !== '' && s.endsWith('.service'));
      
      // Try to extract working directory from each service
      for (const service of services) {
        const serviceName = service.replace('.service', '');
        const workingDirCommand = `${sshCommand} "systemctl show ${service} -p WorkingDirectory --value 2>/dev/null || echo ''"`;
        
        try {
          const { stdout: workingDir } = await execPromise(workingDirCommand);
          const path = workingDir.trim();
          
          if (path && path !== '' && path !== '/' && !path.startsWith('[')) {
            const appName = path.split('/').pop() || serviceName;
            
            if (appMap.has(appName)) {
              appMap.get(appName).service = serviceName;
            } else {
              // Check if this path matches any directory we found
              for (const [existingName, info] of appMap.entries()) {
                if (info.path === path || info.path.includes(appName)) {
                  info.service = serviceName;
                  break;
                }
              }
            }
          }
        } catch (err) {
          // Skip if we can't get working directory
        }
      }
    } catch (error) {
      console.log('   ℹ️  Could not scan systemd services');
    }
    
    // Convert map to array
    const apps = Array.from(appMap.entries()).map(([name, info]) => ({
      name,
      path: info.path,
      service: info.service
    }));
    
    if (apps.length === 0) {
      console.log('❌ No apps found on EC2.');
      console.log('   • Checked directories: /apps, /home/*/apps, /opt/apps');
      console.log('   • Checked systemd services matching: castlerock, costtracker, po-backend');
      console.log('\n   Please run setup-multi-app.js first to deploy an application.\n');
      rl.close();
      return;
    }
    
    console.log('✅ Found the following apps:\n');
    apps.forEach((app, index) => {
      console.log(`   ${index + 1}. ${app.name}`);
      console.log(`      Path: ${app.path || 'unknown'}`);
      console.log(`      Service: ${app.service || 'not detected'}`);
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
    
    // Step 4: Confirm or set service name
    if (selectedApp.service) {
      console.log(`\n✅ Using detected service: ${selectedApp.service}`);
      serviceName = selectedApp.service;
      const changeService = await question('Use different service? (press Enter to keep, or type service name): ');
      if (changeService.trim()) {
        serviceName = changeService.trim();
      }
    } else {
      console.log('\n⚠️  No systemd service auto-detected for this app');
      console.log('   Searching for possible services...\n');
      
      // Try to find services that might match
      const findServicesCommand = `${sshCommand} "systemctl list-units --type=service --all --no-pager --plain --no-legend | awk '{print \\$1}' | grep -v '@' | sort"`;
      
      try {
        const { stdout: allServices } = await execPromise(findServicesCommand);
        const serviceList = allServices.trim().split('\n')
          .filter(s => s.endsWith('.service'))
          .map(s => s.replace('.service', ''));
        
        // Filter to services that might be related
        const likelyServices = serviceList.filter(s => 
          s.toLowerCase().includes(appVersion.toLowerCase()) ||
          appVersion.toLowerCase().includes(s.toLowerCase()) ||
          s.toLowerCase().includes('costtracker') ||
          s.toLowerCase().includes('blossomhill') ||
          s.toLowerCase().includes('castlerock') ||
          s.toLowerCase().includes('crm') ||
          s.toLowerCase().includes('backend') ||
          s.toLowerCase().includes('node') ||
          s.toLowerCase().includes('app')
        );
        
        if (likelyServices.length > 0) {
          console.log('   Possible matching services:');
          likelyServices.slice(0, 15).forEach((s, idx) => {
            console.log(`      ${idx + 1}. ${s}`);
          });
          console.log('');
        } else {
          // Show all user services if no matches
          const userServices = serviceList.filter(s => 
            !s.startsWith('systemd-') && 
            !s.startsWith('dbus-') &&
            !s.startsWith('getty@') &&
            !s.includes('system-')
          );
          
          if (userServices.length > 0) {
            console.log('   All available services (showing first 20):');
            userServices.slice(0, 20).forEach((s, idx) => {
              console.log(`      ${idx + 1}. ${s}`);
            });
            console.log('');
          }
        }
        
        console.log('   💡 Tip: Check running services with: systemctl list-units --type=service --state=running');
        console.log('');
      } catch (err) {
        // Ignore if we can't list services
      }
      
      serviceName = await question('Enter the service name (or press Enter to skip service restart): ');
      if (!serviceName || serviceName.trim() === '') {
        console.log('⚠️  Warning: Deployment will continue without restarting a service.');
        const continueWithout = await question('Continue without service restart? (yes/no): ');
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
      const { stdout: pullOutput } = await execPromise(pullCommand);
      console.log(pullOutput);
    } catch (error) {
      console.error('❌ Git pull failed:', error.message);
      throw error;
    }

    // Step 2: Install dependencies
    console.log('📦 Step 2/5: Installing dependencies...');
    const installCommand = `${sshCommand} "cd ${appPath} && npm install --production"`;
    try {
      const { stdout: installOutput } = await execPromise(installCommand);
      console.log('✅ Dependencies installed');
    } catch (error) {
      console.error('❌ npm install failed:', error.message);
      throw error;
    }

    // Step 3: Run database migrations (if any)
    console.log('🗄️  Step 3/5: Running database migrations...');
    const migrateCommand = `${sshCommand} "cd ${appPath} && npm run migrate 2>&1 || echo 'No migrations or migrate script not found'"`;
    try {
      const { stdout: migrateOutput } = await execPromise(migrateCommand);
      console.log(migrateOutput);
    } catch (error) {
      console.log('ℹ️  No migrations run (this is normal if no migrate script exists)');
    }

    // Step 4: Restart the service (if service name provided)
    if (serviceName) {
      console.log('🔄 Step 4/5: Restarting application service...');
      const restartCommand = `${sshCommand} "sudo systemctl restart ${serviceName}"`;
      try {
        await execPromise(restartCommand);
        console.log('✅ Service restarted');
      } catch (error) {
        console.error('❌ Service restart failed:', error.message);
        throw error;
      }

      // Step 5: Check service status
      console.log('🔍 Step 5/5: Checking service status...');
      const statusCommand = `${sshCommand} "sudo systemctl status ${serviceName} --no-pager -l"`;
      try {
        const { stdout: statusOutput } = await execPromise(statusCommand);
        console.log(statusOutput);
      } catch (error) {
        // Status command may return non-zero even if running, so we'll show the output anyway
        if (error.stdout) {
          console.log(error.stdout);
        }
      }
    } else {
      console.log('⏭️  Step 4/5: Skipping service restart (no service configured)');
      console.log('⏭️  Step 5/5: Skipping service status check');
      console.log('\n⚠️  Remember to manually restart your application!');
    }

    console.log('\n✅ Deployment completed successfully!\n');
    console.log('📊 Next steps:');
    if (serviceName) {
      console.log(`   • View logs: ${sshCommand.split(' ').slice(0, -1).join(' ')} "sudo journalctl -u ${serviceName} -f"`);
      console.log(`   • Check status: ${sshCommand.split(' ').slice(0, -1).join(' ')} "sudo systemctl status ${serviceName}"`);
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
