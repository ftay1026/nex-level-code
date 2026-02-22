#!/usr/bin/env node
// context-keeper.js — Stop hook
// Automatic session context capture: reads latest exchange,
// asks Haiku to extract decisions/completions/open items,
// writes structured context to session-handoff.md
//
// Separate cursor from development-logger to avoid conflicts.

const fs = require('fs');
const path = require('path');

// --- API Key Resolution ---
function resolveApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  const home = process.env.USERPROFILE || process.env.HOME || '';

  const globalConfig = path.join(home, '.memory-mcp', 'config.json');
  if (fs.existsSync(globalConfig)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(globalConfig, 'utf-8'));
      if (cfg.apiKey) return cfg.apiKey;
    } catch {}
  }

  const candidates = [
    path.join(home, '.config', 'anthropic', 'api_key'),
    path.join(home, '.anthropic', 'api_key'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim();
  }

  return null;
}

// --- Haiku Call ---
async function callHaiku(prompt, maxTokens = 512) {
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
      model: 'claude-3-5-haiku-20241022',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.content?.[0]?.text || null;
}

// --- Transcript: extract latest exchange ---
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
              } else if (name === 'Read' || name === 'Glob' || name === 'Grep') {
                parts.push(`[${name}: ${input.file_path || input.pattern || ''}]`);
              } else {
                parts.push(`[${name}]`);
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

  return {
    text: parts.join('\n'),
    hasToolUse,
    totalLines: lines.length,
  };
}

// --- Cursor (separate file: .context-cursor.json) ---
function getContextCursorPath(cwd) {
  return path.join(cwd, '.memory', 'context-cursor.json');
}

function getContextCursor(cwd, sessionId) {
  const p = getContextCursorPath(cwd);
  if (!fs.existsSync(p)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return data[sessionId] || 0;
  } catch { return 0; }
}

function setContextCursor(cwd, sessionId, line) {
  const p = getContextCursorPath(cwd);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let data = {};
  if (fs.existsSync(p)) {
    try { data = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  data[sessionId] = line;
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// --- Auto-memory path ---
function cwdToProjectKey(cwd) {
  return cwd
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
    .replace(/:/g, '-')
    .replace(/_/g, '-')
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

function getAutoMemoryDir(cwd) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const key = cwdToProjectKey(cwd);
  const upperPath = path.join(home, '.claude', 'projects', key, 'memory');
  const lowerKey = key.replace(/^([A-Z])/, (m) => m.toLowerCase());
  const lowerPath = path.join(home, '.claude', 'projects', lowerKey, 'memory');

  if (fs.existsSync(lowerPath)) return lowerPath;
  if (fs.existsSync(upperPath)) return upperPath;
  return lowerPath;
}

// --- Date/Time ---
function getDateTimeStr() {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().slice(0, 5);
  return `${date} ${time}`;
}

// --- Context Extraction Prompt ---
function buildContextPrompt(exchange) {
  return `You are a session context extractor for an AI coding assistant. Analyze the following exchange and extract ALL meaningful items into these categories:

DECISION: Any decision the user made — approved an approach, rejected an idea, chose between options, confirmed a direction
DONE: Work that was completed — features built, bugs fixed, files created, configs changed
TESTED: Work that was tested and the result (pass/fail)
OPEN: Things still in progress, blocked, or queued for later

Rules:
- Be specific — include file names, feature names, concrete details
- One bullet per item, prefix with category in brackets: [DECISION], [DONE], [TESTED], [OPEN]
- If NOTHING meaningful happened (just chatting, reading, exploring), respond with: NONE
- Keep concise — max 1 line per bullet
- Focus on what CHANGED, not what was discussed

--- EXCHANGE ---
${exchange.slice(0, 6000)}`;
}

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

    // Read latest exchange since cursor
    const cursor = getContextCursor(cwd, session_id);
    const result = getLatestExchange(transcript_path, cursor);
    if (!result) return;

    // Always update cursor
    setContextCursor(cwd, session_id, result.totalLines);

    // Pre-filter: skip trivially short responses with no tool usage
    if (!result.hasToolUse && result.text.length < 100) return;

    // Ask Haiku: extract session context
    const prompt = buildContextPrompt(result.text);
    const response = await callHaiku(prompt);
    if (!response || response.trim() === 'NONE' || response.trim().startsWith('NONE')) return;

    // Parse Haiku response into bullet lines
    const bullets = response.trim().split('\n')
      .map(l => l.trim())
      .filter(l => l && l !== 'NONE');

    if (bullets.length === 0) return;

    // Build the auto-captured section
    const dateTimeStr = getDateTimeStr();
    const autoStart = `<!-- AUTO-CAPTURED: ${dateTimeStr} -->`;
    const autoEnd = '<!-- END AUTO-CAPTURED -->';
    const bulletLines = bullets.map(line => {
      // Ensure each line starts with "- "
      if (line.startsWith('- ')) return line;
      return `- ${line}`;
    }).join('\n');
    const autoSection = `${autoStart}\n${bulletLines}\n${autoEnd}`;

    // Read or create session-handoff.md
    const memoryDir = getAutoMemoryDir(cwd);
    if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

    const handoffPath = path.join(memoryDir, 'session-handoff.md');
    let content = '';
    if (fs.existsSync(handoffPath)) {
      content = fs.readFileSync(handoffPath, 'utf-8');
    }

    // Replace existing auto-captured section or prepend new one
    const existingStart = content.indexOf('<!-- AUTO-CAPTURED');
    const existingEnd = content.indexOf('<!-- END AUTO-CAPTURED -->');

    if (existingStart !== -1 && existingEnd !== -1) {
      // Replace between markers (inclusive)
      const before = content.substring(0, existingStart);
      const after = content.substring(existingEnd + '<!-- END AUTO-CAPTURED -->'.length);
      content = before + autoSection + after;
    } else {
      // Prepend at top
      if (content.length > 0) {
        content = autoSection + '\n\n' + content;
      } else {
        content = autoSection + '\n';
      }
    }

    fs.writeFileSync(handoffPath, content);

  } catch {
    // Silent failure — never disrupt Claude's work
  }
}

main();
