#!/usr/bin/env node

import { Command } from 'commander';
import { registerInstallCommand } from './commands/install';
import { registerStatusCommand } from './commands/status';
import { registerDoctorCommand } from './commands/doctor';
import { registerUpdateCommand } from './commands/update';
import { registerUninstallCommand } from './commands/uninstall';
import { registerMcpCommand } from './commands/mcp';

const program = new Command();

program
  .name('nlc')
  .description('Nex Level Code (NLC) — 1-click setup for AI coding agent infrastructure')
  .version('0.1.0');

registerInstallCommand(program);
registerStatusCommand(program);
registerDoctorCommand(program);
registerUpdateCommand(program);
registerUninstallCommand(program);
registerMcpCommand(program);

program.parse();
