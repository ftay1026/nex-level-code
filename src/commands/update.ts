import { Command } from 'commander';
import { InstallService } from '../services/install';

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Update NLC scripts and templates to the latest version')
    .option('-t, --tool <id>', 'Update a specific tool')
    .action(async (options) => {
      try {
        console.log('\n  Updating NLC to latest version...\n');
        const service = new InstallService();
        await service.run({
          tool: options.tool,
          force: true,        // Overwrite existing scripts
          skipRules: true,    // Don't touch user's rules file
        });
      } catch (error: any) {
        console.error(`\n  Error: ${error.message}\n`);
        process.exit(1);
      }
    });
}
