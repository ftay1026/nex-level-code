import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { detectInstalledTools, getToolById, ToolDefinition } from '../registry/tools';

export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .description('Remove NLC hooks, scripts, and MCP config (keeps memory files)')
    .option('-t, --tool <id>', 'Uninstall from a specific tool')
    .action(async (options) => {
      try {
        const tools = options.tool
          ? [getToolById(options.tool)].filter(Boolean) as ToolDefinition[]
          : detectInstalledTools();

        if (tools.length === 0) {
          console.log(chalk.yellow('\n  No AI coding tools detected.\n'));
          return;
        }

        console.log(chalk.bold('\n  Nex Level Code — Uninstalling...\n'));

        for (const tool of tools) {
          console.log(chalk.dim(`  Tool: ${tool.displayName}`));

          // Remove hook scripts
          if (tool.hooks.supported && tool.paths.scriptsDir) {
            const scripts = ['nlc-session-start.js', 'nlc-memory-check.js', 'nlc-dev-logger.js'];
            for (const s of scripts) {
              const p = path.join(tool.paths.scriptsDir, s);
              if (await fs.pathExists(p)) {
                await fs.remove(p);
                console.log(chalk.dim(`    ✓ Removed ${s}`));
              }
            }
          }

          // Remove hooks from settings
          if (tool.hooks.supported && await fs.pathExists(tool.paths.settingsFile)) {
            try {
              const settings = await fs.readJSON(tool.paths.settingsFile);
              if (settings.hooks) {
                for (const [event, hookGroups] of Object.entries(settings.hooks)) {
                  settings.hooks[event] = (hookGroups as any[]).filter((group: any) =>
                    !group.hooks?.some((h: any) => h.command?.includes('nlc-'))
                  );
                  // Clean up empty arrays
                  if (settings.hooks[event].length === 0) {
                    delete settings.hooks[event];
                  }
                }
                await fs.writeJSON(tool.paths.settingsFile, settings, { spaces: 2 });
                console.log(chalk.dim('    ✓ Removed NLC hooks from settings'));
              }
            } catch {}
          }

          // Remove MCP config
          const mcpPath = path.resolve(tool.paths.mcpConfigFile);
          if (await fs.pathExists(mcpPath)) {
            try {
              const config = await fs.readJSON(mcpPath);
              if (config.mcpServers?.['nex-level-code']) {
                delete config.mcpServers['nex-level-code'];
                await fs.writeJSON(mcpPath, config, { spaces: 2 });
                console.log(chalk.dim('    ✓ Removed NLC MCP config'));
              }
            } catch {}
          }

          console.log('');
        }

        console.log(chalk.green('  NLC uninstalled. Memory files (session-handoff.md, MEMORY.md) preserved.\n'));
        console.log(chalk.dim('  To reinstall: npx nex-level-code install\n'));

      } catch (error: any) {
        console.error(`\n  Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}
