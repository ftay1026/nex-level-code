import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { detectInstalledTools } from '../registry/tools';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose and fix NLC installation issues')
    .option('--fix', 'Automatically fix issues found')
    .action(async (options) => {
      try {
        console.log(chalk.bold.green('\n  NLC Doctor — Diagnosing...\n'));

        const tools = detectInstalledTools();
        let issues = 0;
        let fixed = 0;

        if (tools.length === 0) {
          console.log(chalk.red('  ✗ No AI coding tools detected'));
          console.log(chalk.dim('    Install Claude Code, Cursor, or another supported tool first.\n'));
          return;
        }

        for (const tool of tools) {
          console.log(chalk.bold(`  Checking ${tool.displayName}...`));

          // Check 1: Scripts directory exists
          if (tool.hooks.supported) {
            if (!await fs.pathExists(tool.paths.scriptsDir)) {
              console.log(chalk.yellow(`    ⚠ Scripts directory missing: ${tool.paths.scriptsDir}`));
              if (options.fix) {
                await fs.ensureDir(tool.paths.scriptsDir);
                console.log(chalk.green(`    → Created ${tool.paths.scriptsDir}`));
                fixed++;
              }
              issues++;
            }
          }

          // Check 2: Settings file exists and is valid JSON
          if (tool.paths.settingsFile) {
            if (await fs.pathExists(tool.paths.settingsFile)) {
              try {
                await fs.readJSON(tool.paths.settingsFile);
                console.log(chalk.green(`    ✓ Settings file valid`));
              } catch {
                console.log(chalk.red(`    ✗ Settings file is invalid JSON: ${tool.paths.settingsFile}`));
                issues++;
              }
            } else {
              console.log(chalk.yellow(`    ⚠ Settings file missing: ${tool.paths.settingsFile}`));
              issues++;
            }
          }

          // Check 3: Node.js available
          const nodePath = process.execPath;
          if (!await fs.pathExists(nodePath)) {
            console.log(chalk.red(`    ✗ Node.js not found at: ${nodePath}`));
            issues++;
          } else {
            console.log(chalk.green(`    ✓ Node.js: ${nodePath}`));
          }

          // Check 4: Hook scripts reference valid node path
          if (tool.hooks.supported && await fs.pathExists(tool.paths.settingsFile)) {
            try {
              const settings = await fs.readJSON(tool.paths.settingsFile);
              for (const [event, hookGroups] of Object.entries(settings.hooks || {})) {
                for (const group of hookGroups as any[]) {
                  for (const h of group.hooks || []) {
                    if (h.command?.includes('nlc-')) {
                      // Extract the node path from the command
                      const match = h.command.match(/"([^"]+)"/);
                      if (match && !await fs.pathExists(match[1])) {
                        console.log(chalk.red(`    ✗ Hook ${event}: Node path invalid: ${match[1]}`));
                        issues++;
                      }
                    }
                  }
                }
              }
            } catch {}
          }

          // Check 5: ANTHROPIC_API_KEY for dev-logger
          if (!process.env.ANTHROPIC_API_KEY) {
            const home = process.env.USERPROFILE || process.env.HOME || '';
            const keyFiles = [
              path.join(home, '.memory-mcp', 'config.json'),
              path.join(home, '.config', 'anthropic', 'api_key'),
              path.join(home, '.anthropic', 'api_key'),
            ];
            const hasKey = keyFiles.some(f => fs.pathExistsSync(f));
            if (!hasKey) {
              console.log(chalk.yellow('    ⚠ No API key found for dev-logger (ANTHROPIC_API_KEY or config file)'));
              console.log(chalk.dim('      Dev-logger needs an API key to call Haiku for semantic analysis.'));
              issues++;
            } else {
              console.log(chalk.green('    ✓ API key found for dev-logger'));
            }
          } else {
            console.log(chalk.green('    ✓ ANTHROPIC_API_KEY set'));
          }

          console.log('');
        }

        // Summary
        if (issues === 0) {
          console.log(chalk.bold.green('  All checks passed! NLC is healthy.\n'));
        } else {
          console.log(chalk.yellow(`  Found ${issues} issue${issues !== 1 ? 's' : ''}.`));
          if (options.fix) {
            console.log(chalk.green(`  Fixed ${fixed} issue${fixed !== 1 ? 's' : ''}.`));
          } else {
            console.log(chalk.dim('  Run `nlc doctor --fix` to auto-fix what can be fixed.\n'));
          }
        }

      } catch (error: any) {
        console.error(`\n  Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}
