/**
 * NLC MCP Server — Model Context Protocol server for in-session agent tools.
 *
 * Exposes tools that let the agent check NLC status, read/update memory,
 * and manage session handoffs.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

interface McpOptions {
  verbose?: boolean;
}

function log(options: McpOptions, ...args: any[]): void {
  if (options.verbose) {
    process.stderr.write(`[nlc-mcp] ${args.join(' ')}\n`);
  }
}

function cwdToProjectKey(cwd: string): string {
  return cwd
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
    .replace(/:/g, '-')
    .replace(/_/g, '-')
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

function getMemoryDir(cwd: string): string {
  const home = os.homedir();
  const key = cwdToProjectKey(cwd);
  const lowerKey = key.replace(/^([A-Z])/, (m) => m.toLowerCase());

  const candidates = [
    path.join(home, '.claude', 'projects', lowerKey, 'memory'),
    path.join(home, '.claude', 'projects', key, 'memory'),
    path.join(home, '.nlc', 'projects', lowerKey),
  ];

  for (const p of candidates) {
    if (fs.pathExistsSync(p)) return p;
  }
  return candidates[0];
}

export async function startMcpServer(options: McpOptions = {}): Promise<void> {
  const server = new McpServer({
    name: 'nex-level-code',
    version: '0.1.0',
  });

  // ─── Tool: nlc-status ────────────────────────────────────────
  server.registerTool('nlc-status', {
    description: 'Check NLC installation status. Returns which components are installed and healthy.',
    inputSchema: {
      cwd: z.string().optional().describe('Project working directory (defaults to process.cwd())'),
    },
  }, async (params) => {
    const cwd = params.cwd || process.cwd();
    const home = os.homedir();

    const checks: Record<string, string> = {};

    // Check Claude Code hooks
    const scriptsDir = path.join(home, '.claude', 'scripts');
    const scripts = ['nlc-session-start.js', 'nlc-memory-check.js', 'nlc-dev-logger.js'];
    let installed = 0;
    for (const s of scripts) {
      if (await fs.pathExists(path.join(scriptsDir, s))) installed++;
    }
    checks['hook_scripts'] = `${installed}/${scripts.length} installed`;

    // Check memory files
    const memoryDir = getMemoryDir(cwd);
    checks['memory_dir'] = memoryDir;
    checks['session_handoff'] = await fs.pathExists(path.join(memoryDir, 'session-handoff.md')) ? 'exists' : 'missing';
    checks['memory_md'] = await fs.pathExists(path.join(memoryDir, 'MEMORY.md')) ? 'exists' : 'missing';

    // Check today's dev log
    const today = new Date().toISOString().split('T')[0];
    const devLog = path.join(memoryDir, `${today}.md`);
    checks['dev_log_today'] = await fs.pathExists(devLog) ? 'exists' : 'none yet';

    return {
      content: [{ type: 'text', text: JSON.stringify(checks, null, 2) }],
    };
  });

  // ─── Tool: nlc-handoff ───────────────────────────────────────
  server.registerTool('nlc-handoff', {
    description: 'Read or update the session handoff file. Use action "read" to get current content, "update" to write new content.',
    inputSchema: {
      action: z.enum(['read', 'update']).describe('Action to perform'),
      cwd: z.string().optional().describe('Project working directory'),
      content: z.string().optional().describe('New content for the handoff file (required for "update")'),
    },
  }, async (params) => {
    const cwd = params.cwd || process.cwd();
    const memoryDir = getMemoryDir(cwd);
    const handoffPath = path.join(memoryDir, 'session-handoff.md');

    if (params.action === 'read') {
      if (!await fs.pathExists(handoffPath)) {
        return { content: [{ type: 'text', text: 'No session-handoff.md found. Run `nlc install` to create one.' }] };
      }
      const content = await fs.readFile(handoffPath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    }

    if (params.action === 'update') {
      if (!params.content) {
        return { content: [{ type: 'text', text: 'Error: content is required for update action.' }] };
      }
      await fs.ensureDir(memoryDir);
      await fs.writeFile(handoffPath, params.content);
      return { content: [{ type: 'text', text: `session-handoff.md updated (${params.content.length} chars).` }] };
    }

    return { content: [{ type: 'text', text: 'Unknown action.' }] };
  });

  // ─── Tool: nlc-memory ────────────────────────────────────────
  server.registerTool('nlc-memory', {
    description: 'Read or update MEMORY.md. Use action "read" to get current content, "update" to write new content.',
    inputSchema: {
      action: z.enum(['read', 'update']).describe('Action to perform'),
      cwd: z.string().optional().describe('Project working directory'),
      content: z.string().optional().describe('New content for MEMORY.md (required for "update")'),
    },
  }, async (params) => {
    const cwd = params.cwd || process.cwd();
    const memoryDir = getMemoryDir(cwd);
    const memoryPath = path.join(memoryDir, 'MEMORY.md');

    if (params.action === 'read') {
      if (!await fs.pathExists(memoryPath)) {
        return { content: [{ type: 'text', text: 'No MEMORY.md found. Run `nlc install` to create one.' }] };
      }
      const content = await fs.readFile(memoryPath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    }

    if (params.action === 'update') {
      if (!params.content) {
        return { content: [{ type: 'text', text: 'Error: content is required for update action.' }] };
      }
      await fs.ensureDir(memoryDir);
      await fs.writeFile(memoryPath, params.content);
      return { content: [{ type: 'text', text: `MEMORY.md updated (${params.content.length} chars).` }] };
    }

    return { content: [{ type: 'text', text: 'Unknown action.' }] };
  });

  // ─── Tool: nlc-log ───────────────────────────────────────────
  server.registerTool('nlc-log', {
    description: 'Read development logs. Returns today\'s log by default, or specify a date.',
    inputSchema: {
      cwd: z.string().optional().describe('Project working directory'),
      date: z.string().optional().describe('Date to read (YYYY-MM-DD format). Defaults to today.'),
      days: z.number().optional().describe('Number of recent days to include. Defaults to 1.'),
    },
  }, async (params) => {
    const cwd = params.cwd || process.cwd();
    const memoryDir = getMemoryDir(cwd);
    const daysBack = params.days || 1;

    const logs: string[] = [];

    for (let i = 0; i < daysBack; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = params.date && i === 0 ? params.date : d.toISOString().split('T')[0];
      const logPath = path.join(memoryDir, `${dateStr}.md`);

      if (await fs.pathExists(logPath)) {
        const content = await fs.readFile(logPath, 'utf-8');
        logs.push(content);
      }
    }

    if (logs.length === 0) {
      return { content: [{ type: 'text', text: 'No development logs found.' }] };
    }

    return { content: [{ type: 'text', text: logs.join('\n\n') }] };
  });

  // ─── Tool: nlc-doctor ────────────────────────────────────────
  server.registerTool('nlc-doctor', {
    description: 'Run NLC health checks and report any issues.',
    inputSchema: {
      cwd: z.string().optional().describe('Project working directory'),
    },
  }, async (params) => {
    const cwd = params.cwd || process.cwd();
    const home = os.homedir();
    const issues: string[] = [];
    const healthy: string[] = [];

    // Check scripts
    const scriptsDir = path.join(home, '.claude', 'scripts');
    const scripts = ['nlc-session-start.js', 'nlc-memory-check.js', 'nlc-dev-logger.js'];
    for (const s of scripts) {
      if (await fs.pathExists(path.join(scriptsDir, s))) {
        healthy.push(`Script ${s}: installed`);
      } else {
        issues.push(`Script ${s}: MISSING`);
      }
    }

    // Check settings
    const settingsPath = path.join(home, '.claude', 'settings.json');
    if (await fs.pathExists(settingsPath)) {
      try {
        const settings = await fs.readJSON(settingsPath);
        healthy.push('Settings file: valid');

        // Check hooks
        const hooks = settings.hooks || {};
        let nlcHooks = 0;
        for (const [, hookGroups] of Object.entries(hooks)) {
          for (const group of hookGroups as any[]) {
            for (const h of group.hooks || []) {
              if (h.command?.includes('nlc-')) nlcHooks++;
            }
          }
        }
        if (nlcHooks > 0) {
          healthy.push(`Hooks: ${nlcHooks} registered`);
        } else {
          issues.push('Hooks: no NLC hooks registered');
        }
      } catch {
        issues.push('Settings file: invalid JSON');
      }
    } else {
      issues.push('Settings file: MISSING');
    }

    const report = [
      '# NLC Health Check',
      '',
      `Issues: ${issues.length}`,
      `Healthy: ${healthy.length}`,
      '',
      ...issues.map(i => `❌ ${i}`),
      ...healthy.map(h => `✅ ${h}`),
    ].join('\n');

    return { content: [{ type: 'text', text: report }] };
  });

  // ─── Start server ────────────────────────────────────────────
  log(options, 'Starting NLC MCP server...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(options, 'NLC MCP server running.');
}
