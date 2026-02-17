#!/usr/bin/env node
// NLC Development Logger — Installed by Nex Level Code (NLC)
// Fires on stop: reads latest exchange, asks a small LLM if a task was completed,
// logs to memory/YYYY-MM-DD.md.
// DO NOT EDIT — managed by NLC. Run `nlc update` to get latest version.

const fs = require('fs');
const path = require('path');

// --- API Key Resolution ---
function resolveApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  const home = process.env.USERPROFILE || process.env.HOME || '';

  // Check common config locations
  const candidates = [
    path.join(home, '.memory-mcp', 'config.json'),
    path.join(home, '.nlc', 'config.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (cfg.apiKey) return cfg.apiKey;
      } catch {}
    }
  }

  // Check file-based key storage
  const keyFiles = [
    path.join(home, '.config', 'anthropic', 'api_key'),
    path.join(home, '.anthropic', 'api_key'),
  ];
  for (const p of keyFiles) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim();
  }

  return null;
}

// --- LLM Call ---
async function callSmallModel(prompt, maxTokens = 256) {
  const key = resolveApiKey();
  if (!key) return null;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.content?.[0]?.text || null;
}

// --- Transcript Parsing ---
function getLatestExchange(transcriptPath, cursorLine) {
  if (!fs.existsSync(transcriptPath)) return null;

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const newLines = lines.slice(cursorLine);

  if (newLines.length === 0) return { text: '', hasToolUse: false, totalLines: lines.length };

  const parts = [];
  let hasToolUse = false;

  for (const line of newLines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'assistant') {
        const msgContent = entry.message?.content;
        if (typeof msgContent === 'string') {
          parts.push(msgContent);
        } else if (Array.isArray(msgContent)) {
          for (const block of msgContent) {
            if (block.type === 'text' && block.text) {
              parts.push(block.text);
            } else if (block.type === 'tool_use') {
              hasToolUse = true;
              const name = block.name || 'unknown';
              const input = block.input || {};
              if (name === 'Write' || name === 'Edit') {
                parts.push(`[${name}: ${input.file_path || 'unknown file'}]`);
              } else if (name === 'Bash') {
                parts.push(`[Bash: ${(input.command || '').slice(0, 300)}]`);
              } else {
                parts.push(`[${name}: ${input.file_path || input.pattern || ''}]`);
              }
            }
          }
        }
      } else if (entry.type === 'user') {
        const msgContent = entry.message?.content;
        const text = typeof msgContent === 'string'
          ? msgContent
          : Array.isArray(msgContent)
            ? msgContent.filter(b => b.type === 'text').map(b => b.text).join(' ')
            : '';
        if (text) parts.push(`USER: ${text.slice(0, 500)}`);
      }
    } catch {}
  }

  return { text: parts.join('\n'), hasToolUse, totalLines: lines.length };
}

// --- Cursor (per-session progress tracking) ---
function getCursorPath(cwd) {
  return path.join(cwd, '.memory', 'dev-cursor.json');
}

function getCursor(cwd, sessionId) {
  const p = getCursorPath(cwd);
  if (!fs.existsSync(p)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return data[sessionId] || 0;
  } catch { return 0; }
}

function setCursor(cwd, sessionId, line) {
  const p = getCursorPath(cwd);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let data = {};
  if (fs.existsSync(p)) {
    try { data = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  data[sessionId] = line;
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// --- Memory Directory ---
function cwdToProjectKey(cwd) {
  return cwd
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
    .replace(/:/g, '-')
    .replace(/_/g, '-')
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

function getMemoryDir(cwd) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const key = cwdToProjectKey(cwd);
  const lowerKey = key.replace(/^([A-Z])/, (m) => m.toLowerCase());

  const candidates = [
    path.join(home, '.claude', 'projects', lowerKey, 'memory'),
    path.join(home, '.claude', 'projects', key, 'memory'),
    path.join(home, '.nlc', 'projects', lowerKey),
    path.join(home, '.nlc', 'projects', key),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(home, '.nlc', 'projects', lowerKey);
}

// --- Development Extraction Prompt ---
function buildDevPrompt(exchange) {
  return `You are a development logger. Analyze the following exchange between a user and an AI coding assistant. Determine if a meaningful task was COMPLETED (not just started or discussed).

A "development" is: a feature implemented, bug fixed, config changed, infrastructure deployed, file created/modified with purpose, tool/dependency installed, test written, document created, or script/automation built.

NOT a development: reading files, asking questions, explaining without acting, work in progress, minor acknowledgments, or planning without implementing.

If a development was completed, respond with ONLY 1-2 concise lines summarizing what was accomplished. Consolidate related steps. Start each line with an action verb. Be specific — include names, paths, or URLs where relevant.

If no development was completed, respond with exactly: NONE

--- EXCHANGE ---
${exchange.slice(0, 6000)}`;
}

// --- Date/Time ---
function getDateStr() { return new Date().toISOString().split('T')[0]; }
function getTimeStr() { return new Date().toTimeString().slice(0, 5); }

// --- Main ---
async function main() {
  try {
    let input = '';
    await new Promise((resolve) => {
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => input += chunk);
      process.stdin.on('end', resolve);
      setTimeout(resolve, 2000);
    });

    if (!input.trim()) return;
    const hookData = JSON.parse(input);
    const { session_id, transcript_path, cwd } = hookData;
    if (!transcript_path || !cwd || !session_id) return;

    const cursor = getCursor(cwd, session_id);
    const result = getLatestExchange(transcript_path, cursor);
    if (!result) return;

    setCursor(cwd, session_id, result.totalLines);

    // Pre-filter: skip trivially short responses with no tool usage
    if (!result.hasToolUse && result.text.length < 100) return;

    const prompt = buildDevPrompt(result.text);
    const response = await callSmallModel(prompt);
    if (!response || response.trim() === 'NONE' || response.trim().startsWith('NONE')) return;

    // Log to memory directory
    const memoryDir = getMemoryDir(cwd);
    if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

    const dateStr = getDateStr();
    const timeStr = getTimeStr();
    const logFile = path.join(memoryDir, `${dateStr}.md`);

    let existing = '';
    if (fs.existsSync(logFile)) {
      existing = fs.readFileSync(logFile, 'utf-8');
    } else {
      existing = `# Developments — ${dateStr}\n\n`;
    }

    const devLines = response.trim().split('\n')
      .map(l => l.trim())
      .filter(l => l && l !== 'NONE');

    if (devLines.length === 0) return;

    const entries = devLines.map(line => `- **${timeStr}** — ${line}`).join('\n');
    fs.writeFileSync(logFile, existing + entries + '\n');

  } catch {
    // Silent failure — never disrupt the agent's work
  }
}

main();
