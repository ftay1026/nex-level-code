import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { detectInstalledTools, getToolById, ToolDefinition } from '../registry/tools';

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show NLC installation status')
    .option('-t, --tool <id>', 'Check a specific tool')
    .action(async (options) => {
      try {
        const tools = options.tool
          ? [getToolById(options.tool)].filter(Boolean) as ToolDefinition[]
          : detectInstalledTools();

        if (tools.length === 0) {
          console.log(chalk.yellow('\n  No AI coding tools detected.\n'));
          return;
        }

        console.log(chalk.bold.green('\n  Nex Level Code (NLC) — Status\n'));

        for (const tool of tools) {
          console.log(chalk.bold(`  ${tool.displayName}`));

          // Check scripts
          if (tool.hooks.supported && tool.paths.scriptsDir) {
            const scriptsDir = tool.paths.scriptsDir;
            const scripts = ['nlc-session-start.js', 'nlc-memory-check.js', 'nlc-dev-logger.js'];
            let installed = 0;
            for (const s of scripts) {
              if (await fs.pathExists(path.join(scriptsDir, s))) installed++;
            }
            const status = installed === scripts.length ? chalk.green('✓') :
              installed > 0 ? chalk.yellow('partial') : chalk.red('✗');
            console.log(`    Scripts:     ${status} (${installed}/${scripts.length})`);
          }

          // Check hooks registered
          if (tool.hooks.supported && tool.paths.settingsFile) {
            const settingsFile = tool.paths.settingsFile;
            if (await fs.pathExists(settingsFile)) {
              try {
                const settings = await fs.readJSON(settingsFile);
                const hooks = settings.hooks || {};
                let nlcHooks = 0;
                for (const [, hookGroups] of Object.entries(hooks)) {
                  for (const group of hookGroups as any[]) {
                    for (const h of group.hooks || []) {
                      if (h.command?.includes('nlc-')) nlcHooks++;
                    }
                  }
                }
                console.log(`    Hooks:       ${nlcHooks > 0 ? chalk.green('✓') : chalk.red('✗')} (${nlcHooks} registered)`);
              } catch {
                console.log(`    Hooks:       ${chalk.red('✗')} (settings unreadable)`);
              }
            }
          }

          // Check permissions
          if (tool.permissions.supported && tool.paths.settingsFile) {
            try {
              const settings = await fs.readJSON(tool.paths.settingsFile);
              const perms = settings.permissions?.allow || [];
              console.log(`    Permissions: ${perms.length > 0 ? chalk.green('✓') : chalk.yellow('?')} (${perms.length} rules)`);
            } catch {
              console.log(`    Permissions: ${chalk.red('✗')}`);
            }
          }

          // Check rules file
          const rulesPath = path.resolve(tool.paths.rulesFile);
          if (await fs.pathExists(rulesPath)) {
            const content = await fs.readFile(rulesPath, 'utf-8');
            const hasNlc = content.includes('Nex Level Code');
            console.log(`    Rules:       ${hasNlc ? chalk.green('✓') : chalk.yellow('exists, no NLC')} (${tool.paths.rulesFile})`);
          } else {
            console.log(`    Rules:       ${chalk.red('✗')} (${tool.paths.rulesFile} not found)`);
          }

          // Check MCP
          const mcpPath = path.resolve(tool.paths.mcpConfigFile);
          if (await fs.pathExists(mcpPath)) {
            try {
              const mcp = await fs.readJSON(mcpPath);
              const hasNlc = !!mcp.mcpServers?.['nex-level-code'];
              console.log(`    MCP:         ${hasNlc ? chalk.green('✓') : chalk.yellow('exists, no NLC')}`);
            } catch {
              console.log(`    MCP:         ${chalk.red('✗')} (unreadable)`);
            }
          } else {
            console.log(`    MCP:         ${chalk.red('✗')} (not configured)`);
          }

          console.log('');
        }
      } catch (error: any) {
        console.error(`\n  Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}
