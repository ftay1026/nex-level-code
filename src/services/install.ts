/**
 * NLC Install Service — The core of Nex Level Code.
 *
 * Detects the AI tool, copies hook scripts, registers hooks,
 * sets permissions, creates starter files, and adds MCP config.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { ToolDefinition, detectInstalledTools, getToolById } from '../registry/tools';

export interface InstallOptions {
  tool?: string;       // Force a specific tool (skip detection)
  force?: boolean;     // Overwrite existing files
  skipHooks?: boolean; // Don't install hook scripts
  skipRules?: boolean; // Don't install behavioral rules
  verbose?: boolean;
}

export interface InstallResult {
  tool: ToolDefinition;
  scriptsInstalled: string[];
  hooksRegistered: string[];
  rulesFile: string | null;
  starterFiles: string[];
  mcpConfigured: boolean;
  permissionsSet: boolean;
  warnings: string[];
}

/**
 * Get the templates directory (shipped inside the npm package).
 */
function getTemplatesDir(): string {
  return path.join(__dirname, '..', '..', 'templates');
}

/**
 * Get the node executable path (full path for Windows compatibility).
 */
function getNodePath(): string {
  return process.execPath;
}

export class InstallService {

  async run(options: InstallOptions = {}): Promise<InstallResult> {
    const tool = await this.resolveTool(options.tool);
    const templatesDir = getTemplatesDir();
    const nodePath = getNodePath();

    const result: InstallResult = {
      tool,
      scriptsInstalled: [],
      hooksRegistered: [],
      rulesFile: null,
      starterFiles: [],
      mcpConfigured: false,
      permissionsSet: false,
      warnings: [],
    };

    console.log(chalk.bold.green('\n  Nex Level Code (NLC) — Installing...\n'));
    console.log(chalk.dim(`  Tool: ${tool.displayName}`));
    console.log(chalk.dim(`  Templates: ${templatesDir}\n`));

    // Step 1: Install hook scripts
    if (!options.skipHooks && tool.hooks.supported) {
      await this.installHookScripts(tool, templatesDir, result, options);
    } else if (!tool.hooks.supported) {
      result.warnings.push(`${tool.displayName} doesn't support lifecycle hooks yet. Hook scripts skipped.`);
    }

    // Step 2: Register hooks in settings
    if (!options.skipHooks && tool.hooks.supported) {
      await this.registerHooks(tool, nodePath, result, options);
    }

    // Step 3: Set permissions
    if (tool.permissions.supported) {
      await this.setPermissions(tool, result, options);
    }

    // Step 4: Install behavioral rules
    if (!options.skipRules) {
      await this.installRules(tool, templatesDir, result, options);
    }

    // Step 5: Create starter files
    await this.createStarterFiles(tool, templatesDir, result, options);

    // Step 6: Configure MCP
    await this.configureMcp(tool, result, options);

    // Summary
    this.printSummary(result);

    return result;
  }

  // ─── Tool Resolution ────────────────────────────────────────

  private async resolveTool(toolId?: string): Promise<ToolDefinition> {
    if (toolId) {
      const tool = getToolById(toolId);
      if (!tool) throw new Error(`Unknown tool: ${toolId}. Valid options: claude, cursor, github, windsurf, codex`);
      return tool;
    }

    const detected = detectInstalledTools();

    if (detected.length === 0) {
      throw new Error(
        'No AI coding tools detected. Install Claude Code, Cursor, or another supported tool first.\n' +
        'Or specify one explicitly: nlc install --tool claude'
      );
    }

    if (detected.length === 1) {
      console.log(chalk.dim(`  Auto-detected: ${detected[0].displayName}\n`));
      return detected[0];
    }

    // Multiple tools found — prefer Claude Code if available
    const claude = detected.find(t => t.id === 'claude');
    if (claude) {
      console.log(chalk.dim(`  Multiple tools detected. Using: ${claude.displayName}\n`));
      return claude;
    }

    return detected[0];
  }

  // ─── Step 1: Hook Scripts ───────────────────────────────────

  private async installHookScripts(
    tool: ToolDefinition,
    templatesDir: string,
    result: InstallResult,
    options: InstallOptions,
  ): Promise<void> {
    console.log(chalk.cyan('  [1/6] Installing hook scripts...'));

    const scriptsDir = tool.paths.scriptsDir;
    await fs.ensureDir(scriptsDir);

    const hooks = ['session-start.js', 'memory-check.js', 'dev-logger.js', 'context-keeper.js', 'dispatch-gate.js'];

    for (const hookFile of hooks) {
      const src = path.join(templatesDir, 'hooks', hookFile);
      const dest = path.join(scriptsDir, `nlc-${hookFile}`);

      if (!await fs.pathExists(src)) {
        result.warnings.push(`Template not found: ${hookFile}`);
        continue;
      }

      if (await fs.pathExists(dest) && !options.force) {
        result.warnings.push(`${hookFile} already exists. Use --force to overwrite.`);
        continue;
      }

      // Read template and replace placeholders
      let content = await fs.readFile(src, 'utf-8');
      content = content.replace(/\{\{TOOL_ID\}\}/g, tool.id);

      await fs.writeFile(dest, content);
      result.scriptsInstalled.push(dest);
      console.log(chalk.dim(`    ✓ ${path.basename(dest)}`));
    }
  }

  // ─── Step 2: Register Hooks ─────────────────────────────────

  private async registerHooks(
    tool: ToolDefinition,
    nodePath: string,
    result: InstallResult,
    options: InstallOptions,
  ): Promise<void> {
    console.log(chalk.cyan('  [2/6] Registering hooks...'));

    const settingsFile = tool.paths.settingsFile;
    let settings: any = {};

    if (await fs.pathExists(settingsFile)) {
      try {
        settings = await fs.readJSON(settingsFile);
      } catch {
        result.warnings.push(`Could not parse ${settingsFile}. Creating new.`);
      }
    }

    if (!settings.hooks) settings.hooks = {};

    const scriptsDir = tool.paths.scriptsDir;
    const q = (s: string) => `"${s}"`;

    // Hook mapping: event → script file
    const hookMap: Record<string, { script: string; timeout: number }[]> = {
      SessionStart: [
        { script: 'nlc-session-start.js', timeout: 5 },
      ],
      UserPromptSubmit: [
        { script: 'nlc-memory-check.js', timeout: 5 },
      ],
      Stop: [
        { script: 'nlc-dev-logger.js', timeout: 30 },
        { script: 'nlc-context-keeper.js', timeout: 30 },
      ],
      PreToolUse: [
        { script: 'nlc-dispatch-gate.js', timeout: 5 },
      ],
    };

    // Detect and wire memory-mcp (claude-code-memory) if installed
    const memoryMcpExtractor = this.findMemoryMcpExtractor(nodePath);
    if (memoryMcpExtractor) {
      // Register on Stop, PreCompact, SessionEnd
      for (const event of ['Stop', 'PreCompact', 'SessionEnd']) {
        if (!tool.hooks.events.includes(event)) continue;
        if (!settings.hooks[event]) settings.hooks[event] = [];

        const alreadyRegistered = settings.hooks[event].some((hookGroup: any) =>
          hookGroup.hooks?.some((h: any) => h.command?.includes('extractor'))
        );

        if (!alreadyRegistered) {
          const command = `${q(nodePath)} ${q(memoryMcpExtractor)}`;
          settings.hooks[event].push({
            hooks: [{ type: 'command', command, timeout: 30 }],
          });
          result.hooksRegistered.push(`${event} → memory-mcp extractor`);
          console.log(chalk.dim(`    ✓ ${event} → memory-mcp extractor`));
        }
      }
    } else {
      result.warnings.push(
        'memory-mcp (claude-code-memory) not found. Install for preference extraction: npm install -g claude-code-memory'
      );
    }

    for (const [event, scripts] of Object.entries(hookMap)) {
      if (!tool.hooks.events.includes(event)) continue;

      if (!settings.hooks[event]) settings.hooks[event] = [];

      for (const { script, timeout } of scripts) {
        const scriptPath = path.join(scriptsDir, script);
        const command = `${q(nodePath)} ${q(scriptPath)}`;

        // Check if this hook is already registered
        const alreadyRegistered = settings.hooks[event].some((hookGroup: any) =>
          hookGroup.hooks?.some((h: any) => h.command?.includes(script))
        );

        if (alreadyRegistered && !options.force) {
          result.warnings.push(`Hook ${event}→${script} already registered.`);
          continue;
        }

        if (alreadyRegistered && options.force) {
          // Remove existing NLC hooks for this event
          settings.hooks[event] = settings.hooks[event].filter((hookGroup: any) =>
            !hookGroup.hooks?.some((h: any) => h.command?.includes('nlc-'))
          );
        }

        settings.hooks[event].push({
          hooks: [{ type: 'command', command, timeout }],
        });
        result.hooksRegistered.push(`${event} → ${script}`);
        console.log(chalk.dim(`    ✓ ${event} → ${script}`));
      }
    }

    await fs.ensureDir(path.dirname(settingsFile));
    await fs.writeJSON(settingsFile, settings, { spaces: 2 });
  }

  // ─── Step 3: Permissions ────────────────────────────────────

  private async setPermissions(
    tool: ToolDefinition,
    result: InstallResult,
    options: InstallOptions,
  ): Promise<void> {
    console.log(chalk.cyan('  [3/6] Setting permissions...'));

    const settingsFile = tool.paths.settingsFile;
    let settings: any = {};

    if (await fs.pathExists(settingsFile)) {
      try {
        settings = await fs.readJSON(settingsFile);
      } catch {}
    }

    if (!settings.permissions) settings.permissions = {};
    if (!settings.permissions.allow) settings.permissions.allow = [];
    if (!settings.permissions.deny) settings.permissions.deny = [];

    // Add any missing permissions
    let added = 0;
    for (const perm of tool.permissions.allowList) {
      if (!settings.permissions.allow.includes(perm)) {
        settings.permissions.allow.push(perm);
        added++;
      }
    }

    await fs.writeJSON(settingsFile, settings, { spaces: 2 });
    result.permissionsSet = true;
    console.log(chalk.dim(`    ✓ ${added} permissions added (${settings.permissions.allow.length} total)`));
  }

  // ─── Step 4: Behavioral Rules ───────────────────────────────

  private async installRules(
    tool: ToolDefinition,
    templatesDir: string,
    result: InstallResult,
    options: InstallOptions,
  ): Promise<void> {
    console.log(chalk.cyan('  [4/6] Installing behavioral rules...'));

    const rulesFile = tool.paths.rulesFile;
    if (!rulesFile) {
      result.warnings.push(`${tool.displayName} doesn't have a known rules file location.`);
      return;
    }

    const templateFile = path.join(templatesDir, 'rules', `${tool.id}.md`);

    if (!await fs.pathExists(templateFile)) {
      // Fall back to generic rules
      const genericTemplate = path.join(templatesDir, 'rules', 'claude.md');
      if (!await fs.pathExists(genericTemplate)) {
        result.warnings.push('No rules template found.');
        return;
      }
    }

    // If rules file already exists, append NLC rules rather than overwriting
    const rulesPath = path.resolve(rulesFile);
    const templateContent = await fs.readFile(
      await fs.pathExists(templateFile) ? templateFile : path.join(templatesDir, 'rules', 'claude.md'),
      'utf-8'
    );

    if (await fs.pathExists(rulesPath)) {
      const existing = await fs.readFile(rulesPath, 'utf-8');

      if (existing.includes('Nex Level Code')) {
        if (!options.force) {
          result.warnings.push(`${rulesFile} already contains NLC rules. Use --force to overwrite.`);
          return;
        }
      }

      // Append NLC section if not present
      if (!existing.includes('Nex Level Code')) {
        const separator = '\n\n---\n\n';
        await fs.writeFile(rulesPath, existing + separator + templateContent);
        result.rulesFile = rulesPath;
        console.log(chalk.dim(`    ✓ Appended NLC rules to ${rulesFile}`));
        return;
      }
    }

    await fs.writeFile(rulesPath, templateContent);
    result.rulesFile = rulesPath;
    console.log(chalk.dim(`    ✓ Created ${rulesFile}`));
  }

  // ─── Step 5: Starter Files ──────────────────────────────────

  private async createStarterFiles(
    tool: ToolDefinition,
    templatesDir: string,
    result: InstallResult,
    options: InstallOptions,
  ): Promise<void> {
    console.log(chalk.cyan('  [5/6] Creating starter files...'));

    // Determine where to put starter files
    // For Claude Code, they go in the auto-memory directory
    const home = os.homedir();
    let starterDir: string;

    if (tool.id === 'claude') {
      // Use Claude's project-based memory directory
      const cwd = process.cwd();
      const key = cwd
        .replace(/\\/g, '-').replace(/\//g, '-')
        .replace(/:/g, '-').replace(/_/g, '-')
        .replace(/^([a-z])/, (m: string) => m.toUpperCase());
      const lowerKey = key.replace(/^([A-Z])/, (m: string) => m.toLowerCase());
      starterDir = path.join(home, '.claude', 'projects', lowerKey, 'memory');
    } else {
      starterDir = path.join(home, '.nlc', 'projects', 'default');
    }

    await fs.ensureDir(starterDir);

    const starters = ['session-handoff.md', 'MEMORY.md'];
    for (const file of starters) {
      const src = path.join(templatesDir, 'starters', file);
      const dest = path.join(starterDir, file);

      if (!await fs.pathExists(src)) continue;

      if (await fs.pathExists(dest) && !options.force) {
        result.warnings.push(`${file} already exists at ${starterDir}. Skipped.`);
        continue;
      }

      await fs.copy(src, dest);
      result.starterFiles.push(dest);
      console.log(chalk.dim(`    ✓ ${file} → ${starterDir}`));
    }
  }

  // ─── Step 6: MCP Config ─────────────────────────────────────

  private async configureMcp(
    tool: ToolDefinition,
    result: InstallResult,
    options: InstallOptions,
  ): Promise<void> {
    console.log(chalk.cyan('  [6/6] Configuring MCP server...'));

    const mcpConfigFile = path.resolve(tool.paths.mcpConfigFile);
    let config: any = {};

    if (await fs.pathExists(mcpConfigFile)) {
      try {
        config = await fs.readJSON(mcpConfigFile);
      } catch {
        result.warnings.push(`Could not parse ${mcpConfigFile}. Creating new.`);
      }
    }

    if (!config.mcpServers) config.mcpServers = {};

    if (config.mcpServers['nex-level-code'] && !options.force) {
      result.warnings.push('NLC MCP already configured.');
      result.mcpConfigured = true;
      console.log(chalk.dim('    ✓ Already configured'));
      return;
    }

    config.mcpServers['nex-level-code'] = {
      command: getNodePath(),
      args: [path.join(__dirname, '..', '..', 'dist', 'mcp-server.js')],
    };

    await fs.ensureDir(path.dirname(mcpConfigFile));
    await fs.writeJSON(mcpConfigFile, config, { spaces: 2 });
    result.mcpConfigured = true;
    console.log(chalk.dim('    ✓ NLC MCP server registered'));
  }

  // ─── Helpers ────────────────────────────────────────────────

  /**
   * Find the memory-mcp (claude-code-memory) extractor script.
   * Returns the full path to extractor.js if installed globally, or null.
   */
  private findMemoryMcpExtractor(nodePath: string): string | null {
    const home = os.homedir();
    const candidates: string[] = [];

    if (process.platform === 'win32') {
      // Windows: npm global installs to AppData/Roaming/npm
      candidates.push(
        path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'claude-code-memory', 'dist', 'extractor.js'),
        path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'claude-code-memory', 'extractor.js'),
      );
    } else {
      // Linux/macOS: common global npm locations
      candidates.push(
        '/usr/local/lib/node_modules/claude-code-memory/dist/extractor.js',
        '/usr/lib/node_modules/claude-code-memory/dist/extractor.js',
        path.join(home, '.npm-global', 'lib', 'node_modules', 'claude-code-memory', 'dist', 'extractor.js'),
        path.join(home, '.nvm', 'versions', 'node', process.version, 'lib', 'node_modules', 'claude-code-memory', 'dist', 'extractor.js'),
      );
    }

    // Also try require.resolve as a fallback
    try {
      const resolved = require.resolve('claude-code-memory/dist/extractor.js');
      if (resolved) return resolved;
    } catch {}

    for (const p of candidates) {
      if (fs.pathExistsSync(p)) return p;
    }

    return null;
  }

  // ─── Summary ────────────────────────────────────────────────

  private printSummary(result: InstallResult): void {
    console.log(chalk.bold.green('\n  ✓ Nex Level Code installed!\n'));

    console.log(chalk.white(`  Tool:        ${result.tool.displayName}`));
    console.log(chalk.white(`  Scripts:     ${result.scriptsInstalled.length} installed`));
    console.log(chalk.white(`  Hooks:       ${result.hooksRegistered.length} registered`));
    console.log(chalk.white(`  Rules:       ${result.rulesFile ? 'installed' : 'skipped'}`));
    console.log(chalk.white(`  Starters:    ${result.starterFiles.length} created`));
    console.log(chalk.white(`  MCP:         ${result.mcpConfigured ? 'configured' : 'skipped'}`));
    console.log(chalk.white(`  Permissions: ${result.permissionsSet ? 'set' : 'skipped'}`));

    if (result.warnings.length > 0) {
      console.log(chalk.yellow('\n  Warnings:'));
      for (const w of result.warnings) {
        console.log(chalk.yellow(`    ⚠ ${w}`));
      }
    }

    console.log(chalk.dim('\n  Your agent is ready. Start a new session to activate.\n'));
  }
}
