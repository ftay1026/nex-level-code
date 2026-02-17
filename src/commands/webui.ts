/**
 * NLC WebUI Command — Set up a self-hosted Claude Code Web UI.
 *
 * Clones claudecodeui, applies production patches (9 fixes),
 * builds the frontend, and prints setup instructions for nginx/SSL/PM2.
 */

import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';

function getTemplatesDir(): string {
  return path.join(__dirname, '..', '..', 'templates');
}

export function registerWebUICommand(program: Command): void {
  const webui = program
    .command('webui')
    .description('Set up a self-hosted Claude Code Web UI with production patches');

  webui
    .command('setup')
    .description('Clone, patch, and build the Claude Code Web UI')
    .option('-d, --dir <path>', 'Install directory', '/opt/claudecodeui')
    .option('--domain <domain>', 'Domain for HTTPS (e.g., code.example.com)')
    .option('--port <port>', 'Backend port', '3001')
    .option('--skip-build', 'Skip npm install and build')
    .action(async (options) => {
      try {
        console.log(chalk.bold('\n  NLC Web UI — Setup\n'));

        const installDir = path.resolve(options.dir);
        const patchFile = path.join(getTemplatesDir(), 'webui', 'patches.diff');

        if (!await fs.pathExists(patchFile)) {
          console.log(chalk.red('  ✗ Patch file not found. NLC installation may be incomplete.'));
          return;
        }

        // 1. Check prerequisites
        console.log(chalk.cyan('  [1/5] Checking prerequisites...'));
        try {
          execSync('git --version', { stdio: 'pipe' });
          console.log(chalk.dim('    ✓ git'));
        } catch {
          console.log(chalk.red('  ✗ git is required but not found.'));
          return;
        }

        try {
          execSync('node --version', { stdio: 'pipe' });
          console.log(chalk.dim('    ✓ node'));
        } catch {
          console.log(chalk.red('  ✗ Node.js is required but not found.'));
          return;
        }

        // 2. Clone or detect existing
        console.log(chalk.cyan('  [2/5] Getting claudecodeui...'));
        if (await fs.pathExists(path.join(installDir, '.git'))) {
          console.log(chalk.dim(`    Found existing repo at ${installDir}`));
          // Pull latest
          try {
            execSync('git stash', { cwd: installDir, stdio: 'pipe' });
            execSync('git pull --rebase', { cwd: installDir, stdio: 'pipe', timeout: 30000 });
            console.log(chalk.dim('    ✓ Pulled latest'));
          } catch {
            console.log(chalk.yellow('    ⚠ Could not pull latest. Proceeding with existing.'));
          }
        } else {
          await fs.ensureDir(path.dirname(installDir));
          try {
            execSync(
              `git clone https://github.com/siteboon/claudecodeui.git "${installDir}"`,
              { stdio: 'pipe', timeout: 60000 }
            );
            console.log(chalk.dim(`    ✓ Cloned to ${installDir}`));
          } catch (e: any) {
            console.log(chalk.red(`  ✗ Failed to clone: ${e.message}`));
            return;
          }
        }

        // 3. Apply patches
        console.log(chalk.cyan('  [3/5] Applying production patches...'));
        try {
          // Copy patch file to install dir
          const localPatch = path.join(installDir, '.nlc-patches.diff');
          await fs.copyFile(patchFile, localPatch);

          execSync(`git apply --check "${localPatch}"`, { cwd: installDir, stdio: 'pipe' });
          execSync(`git apply "${localPatch}"`, { cwd: installDir, stdio: 'pipe' });
          await fs.remove(localPatch);
          console.log(chalk.dim('    ✓ 9 patches applied:'));
          console.log(chalk.dim('      - Processing hang fix (immediate completion signal)'));
          console.log(chalk.dim('      - Auto-approve non-interactive tools'));
          console.log(chalk.dim('      - Inline question panel (no input hijacking)'));
          console.log(chalk.dim('      - Textarea always enabled while AI works'));
          console.log(chalk.dim('      - Process crash handlers'));
          console.log(chalk.dim('      - Abort SDK on WebSocket disconnect'));
          console.log(chalk.dim('      - Dead code cleanup'));
        } catch {
          console.log(chalk.yellow('    ⚠ Patches already applied or conflict detected. Skipping.'));
        }

        // 4. Generate JWT secret
        console.log(chalk.cyan('  [4/5] Configuring...'));
        const envPath = path.join(installDir, '.env');
        let envContent = '';
        if (await fs.pathExists(envPath)) {
          envContent = await fs.readFile(envPath, 'utf-8');
        }

        if (!envContent.includes('JWT_SECRET')) {
          const crypto = require('crypto');
          const secret = crypto.randomBytes(32).toString('hex');
          envContent += `\nJWT_SECRET=${secret}\n`;
          console.log(chalk.dim('    ✓ Generated JWT secret'));
        } else {
          console.log(chalk.dim('    ✓ JWT secret already set'));
        }

        if (options.domain && !envContent.includes('WORKSPACES_ROOT')) {
          // Server deployments typically need a workspace root
          envContent += `WORKSPACES_ROOT=/opt/nex-project\n`;
          console.log(chalk.dim('    ✓ Set workspace root to /opt/nex-project'));
        }

        await fs.writeFile(envPath, envContent.trim() + '\n');

        // 5. Install dependencies and build
        if (!options.skipBuild) {
          console.log(chalk.cyan('  [5/5] Installing dependencies and building...'));
          try {
            execSync('npm install', { cwd: installDir, stdio: 'pipe', timeout: 120000 });
            console.log(chalk.dim('    ✓ Dependencies installed'));
          } catch (e: any) {
            console.log(chalk.yellow(`    ⚠ npm install had warnings: ${e.message?.substring(0, 100)}`));
          }
          try {
            execSync('npm run build', { cwd: installDir, stdio: 'pipe', timeout: 120000 });
            console.log(chalk.dim('    ✓ Frontend built'));
          } catch {
            console.log(chalk.yellow('    ⚠ Build failed or not required (some setups run dev mode)'));
          }
        } else {
          console.log(chalk.dim('  [5/5] Skipping build (--skip-build)'));
        }

        // Summary
        console.log(chalk.green('\n  ✓ Claude Code Web UI installed!\n'));
        console.log(chalk.dim(`  Location: ${installDir}`));
        console.log(chalk.dim(`  Port:     ${options.port}\n`));

        // PM2 instructions
        console.log(chalk.bold('  Next steps:\n'));
        console.log(chalk.white('  1. Start with PM2:'));
        console.log(chalk.dim(`     cd ${installDir}`));
        console.log(chalk.dim(`     pm2 start server/index.js --name claudeui`));
        console.log(chalk.dim('     pm2 save && pm2 startup\n'));

        if (options.domain) {
          console.log(chalk.white('  2. Set up HTTPS (nginx + Let\'s Encrypt):'));
          console.log(chalk.dim(`     # Create nginx config for ${options.domain}`));
          console.log(chalk.dim(`     sudo certbot --nginx -d ${options.domain}\n`));
          console.log(chalk.dim(`     # See full guide: nlc webui guide\n`));
        } else {
          console.log(chalk.white('  2. Access locally:'));
          console.log(chalk.dim(`     http://localhost:${options.port}\n`));
          console.log(chalk.white('  3. For remote access, add --domain:'));
          console.log(chalk.dim('     nlc webui setup --domain code.example.com\n'));
        }

      } catch (error: any) {
        console.error(`\n  Error: ${error.message}\n`);
        process.exit(1);
      }
    });

  webui
    .command('status')
    .description('Check Web UI installation status')
    .option('-d, --dir <path>', 'Install directory', '/opt/claudecodeui')
    .action(async (options) => {
      const installDir = path.resolve(options.dir);
      console.log(chalk.bold('\n  NLC Web UI — Status\n'));

      if (!await fs.pathExists(path.join(installDir, 'server', 'index.js'))) {
        console.log(chalk.yellow(`  Not installed at ${installDir}`));
        console.log(chalk.dim('  Run: nlc webui setup\n'));
        return;
      }

      console.log(chalk.dim(`  Location: ${installDir}`));

      // Check if patches are applied
      try {
        const sdkContent = await fs.readFile(path.join(installDir, 'server', 'claude-sdk.js'), 'utf-8');
        const hasPatches = sdkContent.includes('completionSent');
        console.log(hasPatches
          ? chalk.dim('  Patches:  ✓ Applied')
          : chalk.yellow('  Patches:  ✗ Not applied — run nlc webui setup'));
      } catch {
        console.log(chalk.yellow('  Patches:  ? Could not check'));
      }

      // Check .env
      const envPath = path.join(installDir, '.env');
      if (await fs.pathExists(envPath)) {
        const env = await fs.readFile(envPath, 'utf-8');
        console.log(env.includes('JWT_SECRET')
          ? chalk.dim('  JWT:      ✓ Configured')
          : chalk.yellow('  JWT:      ✗ Missing — run nlc webui setup'));
      }

      // Check if PM2 is running it
      try {
        const pm2List = execSync('pm2 jlist', { stdio: 'pipe' }).toString();
        const processes = JSON.parse(pm2List);
        const uiProcess = processes.find((p: any) =>
          p.name === 'claudeui' || p.pm2_env?.cwd?.includes('claudecodeui')
        );
        if (uiProcess) {
          console.log(chalk.dim(`  PM2:      ✓ Running (pid ${uiProcess.pid}, uptime ${Math.floor((Date.now() - uiProcess.pm2_env.pm_uptime) / 60000)}m)`));
        } else {
          console.log(chalk.yellow('  PM2:      ✗ Not running'));
        }
      } catch {
        console.log(chalk.dim('  PM2:      ? Not installed or not accessible'));
      }

      console.log('');
    });
}
