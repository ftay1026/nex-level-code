/**
 * NLC Sync Command — Set up cross-device memory sync.
 *
 * Creates a private GitHub repo, clones it locally, installs the
 * memory-sync hook, and registers it for SessionStart + Stop events.
 * This lets multiple machines share the same agent "brain."
 */

import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { detectInstalledTools } from '../registry/tools';

function getTemplatesDir(): string {
  return path.join(__dirname, '..', '..', 'templates');
}

function getNodePath(): string {
  return process.execPath;
}

function findRepo(): string | null {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'nex-memory'),
    path.join(home, 'nlc-memory'),
  ];

  if (process.platform === 'win32') {
    for (const d of ['C', 'D', 'E']) {
      candidates.push(path.join(`${d}:`, 'nex-memory'));
      candidates.push(path.join(`${d}:`, 'dev', 'nex-memory'));
    }
  }

  if (process.env.NLC_MEMORY_REPO && fs.pathExistsSync(process.env.NLC_MEMORY_REPO)) {
    return process.env.NLC_MEMORY_REPO;
  }

  for (const p of candidates) {
    if (fs.pathExistsSync(path.join(p, '.git'))) return p;
  }

  return null;
}

export function registerSyncCommand(program: Command): void {
  const sync = program
    .command('sync')
    .description('Set up cross-device memory sync via a shared GitHub repo');

  // ── nlc sync setup ──────────────────────────────────────────
  sync
    .command('setup')
    .description('Create a shared memory repo and install sync hooks')
    .option('-r, --repo <name>', 'GitHub repo name', 'nex-memory')
    .option('-p, --path <path>', 'Local clone path (defaults to ~/nex-memory)')
    .option('--private', 'Make the repo private (default)', true)
    .action(async (options) => {
      try {
        console.log(chalk.bold('\n  NLC Memory Sync — Setup\n'));

        // 1. Check prerequisites
        try {
          execSync('gh --version', { stdio: 'pipe' });
        } catch {
          console.log(chalk.red('  ✗ GitHub CLI (gh) is required but not found.'));
          console.log(chalk.dim('    Install: https://cli.github.com\n'));
          return;
        }

        try {
          execSync('gh auth status', { stdio: 'pipe' });
        } catch {
          console.log(chalk.red('  ✗ Not authenticated with GitHub CLI.'));
          console.log(chalk.dim('    Run: gh auth login\n'));
          return;
        }

        // 2. Check if repo already exists locally
        const existing = findRepo();
        const clonePath = options.path
          ? path.resolve(options.path)
          : existing || path.join(os.homedir(), 'nex-memory');

        if (existing) {
          console.log(chalk.dim(`  Found existing repo: ${existing}`));
        } else {
          // Create the GitHub repo
          console.log(chalk.dim(`  Creating GitHub repo: ${options.repo}...`));
          try {
            execSync(
              `gh repo create ${options.repo} --private --description "Shared AI assistant memory — synced across devices" --clone`,
              { cwd: path.dirname(clonePath), stdio: 'pipe', timeout: 30000 }
            );
            console.log(chalk.dim(`  ✓ Repo created and cloned to ${clonePath}`));
          } catch (e: any) {
            // Repo might already exist on GitHub — try cloning
            try {
              const username = execSync('gh api user -q .login', { stdio: 'pipe' }).toString().trim();
              execSync(
                `gh repo clone ${username}/${options.repo} "${clonePath}"`,
                { stdio: 'pipe', timeout: 30000 }
              );
              console.log(chalk.dim(`  ✓ Cloned existing repo to ${clonePath}`));
            } catch {
              console.log(chalk.red(`  ✗ Failed to create or clone repo: ${e.message}`));
              return;
            }
          }
        }

        // 3. Install sync hook script
        const tools = detectInstalledTools();
        if (tools.length === 0) {
          console.log(chalk.yellow('  No AI coding tools detected.\n'));
          return;
        }

        const templateSrc = path.join(getTemplatesDir(), 'hooks', 'memory-sync.js');
        const nodePath = getNodePath();

        for (const tool of tools) {
          if (!tool.hooks.supported || !tool.paths.scriptsDir) continue;

          console.log(chalk.dim(`\n  Tool: ${tool.displayName}`));

          // Copy sync script
          const scriptDst = path.join(tool.paths.scriptsDir, 'nlc-memory-sync.js');
          await fs.ensureDir(tool.paths.scriptsDir);
          await fs.copyFile(templateSrc, scriptDst);
          console.log(chalk.dim('    ✓ Installed nlc-memory-sync.js'));

          // Register hooks in settings
          if (await fs.pathExists(tool.paths.settingsFile)) {
            try {
              const settings = await fs.readJSON(tool.paths.settingsFile);
              if (!settings.hooks) settings.hooks = {};

              const quote = process.platform === 'win32' ? '"' : '';
              const syncCommand = `${quote}${nodePath}${quote} ${quote}${scriptDst}${quote}`;

              // Add to SessionStart (pull — before other hooks)
              if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [{ hooks: [] }];
              const startHooks = settings.hooks.SessionStart[0].hooks;
              const hasSyncStart = startHooks.some((h: any) => h.command?.includes('nlc-memory-sync'));
              if (!hasSyncStart) {
                startHooks.unshift({ type: 'command', command: syncCommand, timeout: 20 });
                console.log(chalk.dim('    ✓ Registered SessionStart → pull'));
              }

              // Add to Stop (push — after other hooks)
              if (!settings.hooks.Stop) settings.hooks.Stop = [{ hooks: [] }];
              const stopHooks = settings.hooks.Stop[0].hooks;
              const hasSyncStop = stopHooks.some((h: any) => h.command?.includes('nlc-memory-sync'));
              if (!hasSyncStop) {
                stopHooks.push({ type: 'command', command: syncCommand, timeout: 20 });
                console.log(chalk.dim('    ✓ Registered Stop → push'));
              }

              await fs.writeJSON(tool.paths.settingsFile, settings, { spaces: 2 });
            } catch {}
          }
        }

        console.log(chalk.green('\n  ✓ Memory sync configured!\n'));
        console.log(chalk.dim('  How it works:'));
        console.log(chalk.dim('    • Session start → pulls latest memory from GitHub'));
        console.log(chalk.dim('    • After each response → pushes updates to GitHub'));
        console.log(chalk.dim('    • Run this same command on other machines to sync them\n'));
        console.log(chalk.dim(`  Repo: ${clonePath}`));
        console.log(chalk.dim('  To add another machine: nlc sync setup\n'));

      } catch (error: any) {
        console.error(`\n  Error: ${error.message}\n`);
        process.exit(1);
      }
    });

  // ── nlc sync status ─────────────────────────────────────────
  sync
    .command('status')
    .description('Show memory sync status')
    .action(async () => {
      const repoPath = findRepo();
      if (!repoPath) {
        console.log(chalk.yellow('\n  Memory sync not configured. Run: nlc sync setup\n'));
        return;
      }

      console.log(chalk.bold('\n  NLC Memory Sync — Status\n'));
      console.log(chalk.dim(`  Repo: ${repoPath}`));

      // Check git status
      try {
        const log = execSync('git log --oneline -5', { cwd: repoPath, stdio: 'pipe' }).toString().trim();
        console.log(chalk.dim(`\n  Recent syncs:`));
        for (const line of log.split('\n')) {
          console.log(chalk.dim(`    ${line}`));
        }
      } catch {
        console.log(chalk.red('  ✗ Could not read git log'));
      }

      // Check files
      const files = fs.readdirSync(repoPath).filter(f =>
        !f.startsWith('.') && f.endsWith('.md')
      );
      console.log(chalk.dim(`\n  Files synced: ${files.length}`));
      for (const f of files) {
        const stat = fs.statSync(path.join(repoPath, f));
        const age = Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60));
        const ageStr = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;
        console.log(chalk.dim(`    ${f} (${ageStr})`));
      }
      console.log('');
    });
}
