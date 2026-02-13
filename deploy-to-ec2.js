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

  try {
    // Step 1: Get SSH connection info first
    const sshCommand = await question('SSH command (e.g., ssh -i key.pem ec2-user@1.2.3.4): ');
    
    // Step 2: List available apps on EC2
    console.log('\n📂 Scanning for deployed apps on EC2...');
    const listCommand = `${sshCommand} "ls -1 /apps 2>/dev/null || echo 'NO_APPS'"`;
    
    let apps = [];
    try {
      const { stdout } = await execPromise(listCommand);
      const output = stdout.trim();
      
      if (output === 'NO_APPS' || output === '') {
        console.log('❌ No apps found in /apps directory on EC2.');
        console.log('   Please run setup-multi-app.js first to deploy an application.\n');
        rl.close();
        return;
      }
      
      apps = output.split('\n').filter(app => app.trim() !== '');
      
      if (apps.length === 0) {
        console.log('❌ No apps found in /apps directory on EC2.\n');
        rl.close();
        return;
      }
      
      console.log('\n✅ Found the following apps:');
      apps.forEach((app, index) => {
        console.log(`   ${index + 1}. ${app}`);
      });
      console.log('');
      
    } catch (error) {
      console.error('❌ Failed to connect to EC2:', error.message);
      console.log('   Please check your SSH command and try again.\n');
      rl.close();
      return;
    }
    
    // Step 3: Select app to deploy
    const appChoice = await question(`Select app number to deploy (1-${apps.length}): `);
    const appIndex = parseInt(appChoice) - 1;
    
    if (appIndex < 0 || appIndex >= apps.length) {
      console.log('❌ Invalid selection.');
      rl.close();
      return;
    }
    
    const appVersion = apps[appIndex];
    
    // Step 4: Get git branch
    const branch = await question('Git branch to pull (default: main): ') || 'main';
    
    const appPath = `/apps/${appVersion}`;
    const serviceName = `castlerock-po-${appVersion.replace('castlerock-po-', '')}`;

    console.log('\n📋 Deployment Configuration:');
    console.log(`   • App: ${appVersion}`);
    console.log(`   • Path: ${appPath}`);
    console.log(`   • Service: ${serviceName}`);
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

    // Step 4: Restart the service
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

    console.log('\n✅ Deployment completed successfully!\n');
    console.log('📊 Next steps:');
    console.log(`   • View logs: ${sshCommand.split(' ').slice(0, -1).join(' ')} "sudo journalctl -u ${serviceName} -f"`);
    console.log(`   • Check status: ${sshCommand.split(' ').slice(0, -1).join(' ')} "sudo systemctl status ${serviceName}"`);
    console.log('   • Test your application in the browser\n');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   • Check your SSH connection');
    console.log('   • Verify the app folder exists on EC2');
    console.log('   • Ensure git repository is initialized in the app folder');
    console.log('   • Check that the systemd service exists');
    console.log(`   • View service logs: sudo journalctl -u ${serviceName || 'castlerock-po'} -n 50\n`);
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
