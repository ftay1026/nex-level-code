// NLC Session Start Hook — Installed by Nex Level Code (NLC)
// Fires on session start: injects memory protocol + recent development logs.
// DO NOT EDIT — managed by NLC. Run `nlc update` to get latest version.

const fs = require('fs');
const path = require('path');

// --- NLC Config (set during install) ---
const NLC_TOOL = '{{TOOL_ID}}'; // e.g., 'claude', 'cursor'

// --- Path Resolution ---
function getHome() {
  return process.env.USERPROFILE || process.env.HOME || '';
}

function cwdToProjectKey(cwd) {
  return cwd
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
    .replace(/:/g, '-')
    .replace(/_/g, '-')
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

function getMemoryDir(cwd) {
  const home = getHome();
  const key = cwdToProjectKey(cwd);
  const lowerKey = key.replace(/^([A-Z])/, (m) => m.toLowerCase());

  // Try multiple paths (tools use different directory structures)
  const candidates = [
    path.join(home, '.claude', 'projects', lowerKey, 'memory'),
    path.join(home, '.claude', 'projects', key, 'memory'),
    path.join(home, '.nlc', 'projects', lowerKey),
    path.join(home, '.nlc', 'projects', key),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  // Default: NLC's own directory
  return path.join(home, '.nlc', 'projects', lowerKey);
}

function findHandoff(cwd) {
  const memoryDir = getMemoryDir(cwd);
  const handoffPath = path.join(memoryDir, 'session-handoff.md');
  if (fs.existsSync(handoffPath)) return handoffPath;
  return null;
}

function getDateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function readDevLog(cwd, dateStr) {
  const memoryDir = getMemoryDir(cwd);
  const logPath = path.join(memoryDir, `${dateStr}.md`);
  if (!fs.existsSync(logPath)) return null;
  try {
    const content = fs.readFileSync(logPath, 'utf-8').trim();
    if (content.split('\n').length <= 2) return null;
    return content;
  } catch { return null; }
}

// --- Main ---
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);
    const cwd = hookData.cwd || hookData.session_cwd || process.cwd();

    const parts = [];

    // Memory Protocol Reminder
    const handoffPath = findHandoff(cwd);
    if (handoffPath) {
      const stats = fs.statSync(handoffPath);
      const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      const staleNote = ageHours > 2
        ? ` WARNING: It was last updated ${Math.floor(ageHours)} hours ago and may be stale.`
        : '';

      parts.push(
        `[NLC MEMORY PROTOCOL] This project uses session-handoff.md for cross-session context.${staleNote} ` +
        `You MUST update session-handoff.md and MEMORY.md incrementally as you complete tasks — ` +
        `do NOT wait until the end of the session. Context can be lost at any time.`
      );
    }

    // Inject latest auto-captured context from session-handoff.md
    if (handoffPath) {
      try {
        const handoffContent = fs.readFileSync(handoffPath, 'utf-8');
        const autoStart = handoffContent.indexOf('<!-- AUTO-CAPTURED');
        const autoEnd = handoffContent.indexOf('<!-- END AUTO-CAPTURED -->');
        if (autoStart !== -1 && autoEnd !== -1) {
          const autoSection = handoffContent.substring(autoStart, autoEnd + '<!-- END AUTO-CAPTURED -->'.length);
          parts.push('');
          parts.push('[SESSION CONTEXT] Latest auto-captured state:');
          parts.push(autoSection);
        }
      } catch {}
    }

    // Recent Development Logs
    const today = getDateStr(0);
    const yesterday = getDateStr(1);
    const todayLog = readDevLog(cwd, today);
    const yesterdayLog = readDevLog(cwd, yesterday);

    if (yesterdayLog || todayLog) {
      parts.push('');
      parts.push('[NLC RECENT DEVELOPMENTS] Auto-logged task completions:');
      if (yesterdayLog) { parts.push(''); parts.push(yesterdayLog); }
      if (todayLog) { parts.push(''); parts.push(todayLog); }
    }

    if (parts.length > 0) {
      console.log(parts.join('\n'));
    }
  } catch (e) {
    process.exit(0);
  }
});
