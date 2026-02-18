/**
 * Unified Tool Registry — Single source of truth for all AI coding tools.
 *
 * Maps each tool to its config paths so NLC can install to the right locations.
 * Inspired by @ai-coders/context tool registry pattern.
 */

import * as os from 'os';
import * as path from 'path';

export interface ToolDefinition {
  id: string;
  displayName: string;
  /** How to detect if this tool is in use */
  detection: {
    /** Directories to check for (relative to home or project) */
    globalDirs: string[];
    /** Files to check for (relative to project root) */
    projectFiles: string[];
  };
  /** Where NLC installs its pieces */
  paths: {
    /** Directory for hook scripts (global) */
    scriptsDir: string;
    /** Settings/config file for hook registration (global) */
    settingsFile: string;
    /** Rules/instructions file (project-level) */
    rulesFile: string;
    /** MCP config file (project-level) */
    mcpConfigFile: string;
    /** Memory/context directory (global, per-project) */
    memoryDir: string;
  };
  /** Hook system capabilities */
  hooks: {
    /** Does this tool support lifecycle hooks? */
    supported: boolean;
    /** Hook event names this tool recognizes */
    events: string[];
    /** Format of the settings file */
    settingsFormat: 'json' | 'yaml' | 'toml';
  };
  /** Permission system */
  permissions: {
    /** Does this tool have a permission allow-list? */
    supported: boolean;
    /** Permission entries to auto-approve */
    allowList: string[];
  };
}

const HOME = os.homedir();

export const TOOL_REGISTRY: ToolDefinition[] = [
  // ─── Claude Code ───────────────────────────────────────────────
  {
    id: 'claude',
    displayName: 'Claude Code',
    detection: {
      globalDirs: [path.join(HOME, '.claude')],
      projectFiles: ['CLAUDE.md', '.claude/settings.json'],
    },
    paths: {
      scriptsDir: path.join(HOME, '.claude', 'scripts'),
      settingsFile: path.join(HOME, '.claude', 'settings.json'),
      rulesFile: 'CLAUDE.md',
      mcpConfigFile: path.join(HOME, '.claude', 'mcp.json'),
      memoryDir: path.join(HOME, '.claude', 'projects'),
    },
    hooks: {
      supported: true,
      events: ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact', 'SessionEnd'],
      settingsFormat: 'json',
    },
    permissions: {
      supported: true,
      allowList: [
        'Bash(*)', 'Read(*)', 'Edit(*)', 'Write(*)',
        'Grep(*)', 'Glob(*)', 'WebFetch(*)', 'WebSearch(*)',
      ],
    },
  },

  // ─── Cursor AI ─────────────────────────────────────────────────
  {
    id: 'cursor',
    displayName: 'Cursor AI',
    detection: {
      globalDirs: [path.join(HOME, '.cursor')],
      projectFiles: ['.cursorrules', '.cursor/rules'],
    },
    paths: {
      scriptsDir: path.join(HOME, '.cursor', 'scripts'),
      settingsFile: path.join(HOME, '.cursor', 'settings.json'),
      rulesFile: '.cursorrules',
      mcpConfigFile: '.cursor/mcp.json',
      memoryDir: path.join(HOME, '.cursor', 'projects'),
    },
    hooks: {
      supported: false, // Cursor doesn't have lifecycle hooks yet
      events: [],
      settingsFormat: 'json',
    },
    permissions: {
      supported: false,
      allowList: [],
    },
  },

  // ─── GitHub Copilot ────────────────────────────────────────────
  {
    id: 'github',
    displayName: 'GitHub Copilot',
    detection: {
      globalDirs: [],
      projectFiles: ['.github/copilot-instructions.md'],
    },
    paths: {
      scriptsDir: '', // No hook scripts support
      settingsFile: '',
      rulesFile: '.github/copilot-instructions.md',
      mcpConfigFile: '.github/mcp.json',
      memoryDir: '',
    },
    hooks: {
      supported: false,
      events: [],
      settingsFormat: 'json',
    },
    permissions: {
      supported: false,
      allowList: [],
    },
  },

  // ─── Windsurf (Codeium) ────────────────────────────────────────
  {
    id: 'windsurf',
    displayName: 'Windsurf (Codeium)',
    detection: {
      globalDirs: [path.join(HOME, '.windsurf')],
      projectFiles: ['.windsurfrules'],
    },
    paths: {
      scriptsDir: path.join(HOME, '.windsurf', 'scripts'),
      settingsFile: path.join(HOME, '.windsurf', 'settings.json'),
      rulesFile: '.windsurfrules',
      mcpConfigFile: '.windsurf/mcp.json',
      memoryDir: path.join(HOME, '.windsurf', 'projects'),
    },
    hooks: {
      supported: false,
      events: [],
      settingsFormat: 'json',
    },
    permissions: {
      supported: false,
      allowList: [],
    },
  },

  // ─── OpenAI Codex ──────────────────────────────────────────────
  {
    id: 'codex',
    displayName: 'OpenAI Codex CLI',
    detection: {
      globalDirs: [path.join(HOME, '.codex')],
      projectFiles: ['AGENTS.md', '.codex/config.json'],
    },
    paths: {
      scriptsDir: '',
      settingsFile: path.join(HOME, '.codex', 'config.json'),
      rulesFile: 'AGENTS.md',
      mcpConfigFile: '.codex/mcp.json',
      memoryDir: '',
    },
    hooks: {
      supported: false,
      events: [],
      settingsFormat: 'json',
    },
    permissions: {
      supported: false,
      allowList: [],
    },
  },
];

/**
 * Detect which AI tools are installed on this machine.
 */
export function detectInstalledTools(): ToolDefinition[] {
  const fs = require('fs-extra');
  return TOOL_REGISTRY.filter(tool => {
    // Check global directories
    for (const dir of tool.detection.globalDirs) {
      if (fs.pathExistsSync(dir)) return true;
    }
    return false;
  });
}

/**
 * Get a tool definition by ID.
 */
export function getToolById(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find(t => t.id === id);
}

/**
 * Get all tool IDs.
 */
export function getAllToolIds(): string[] {
  return TOOL_REGISTRY.map(t => t.id);
}

/**
 * Get tools that support hooks (the full NLC experience).
 */
export function getToolsWithHooks(): ToolDefinition[] {
  return TOOL_REGISTRY.filter(t => t.hooks.supported);
}
