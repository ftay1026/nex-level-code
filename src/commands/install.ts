import { Command } from 'commander';
import { InstallService } from '../services/install';

export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Install NLC — hooks, memory protocol, behavioral rules, and MCP')
    .option('-t, --tool <id>', 'Force a specific tool (claude, cursor, codex, github, windsurf)')
    .option('-f, --force', 'Overwrite existing files and hooks')
    .option('--skip-hooks', 'Skip hook script installation')
    .option('--skip-rules', 'Skip behavioral rules installation')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      try {
        const service = new InstallService();
        await service.run({
          tool: options.tool,
          force: options.force,
          skipHooks: options.skipHooks,
          skipRules: options.skipRules,
          verbose: options.verbose,
        });
      } catch (error: any) {
        console.error(`\n  Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}
