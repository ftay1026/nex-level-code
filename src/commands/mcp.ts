import { Command } from 'commander';

export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start NLC MCP server (used by .mcp.json config)')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (options) => {
      try {
        // Dynamic import to avoid loading MCP dependencies for other commands
        const { startMcpServer } = await import('../mcp/server');
        await startMcpServer({ verbose: options.verbose });
      } catch (error: any) {
        if (options.verbose) {
          process.stderr.write(`[nlc-mcp] Error: ${error}\n`);
        }
        process.exit(1);
      }
    });
}
