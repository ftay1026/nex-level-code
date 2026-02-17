// NLC Memory Check Hook — Installed by Nex Level Code (NLC)
// Fires on user prompt: warns if session-handoff.md is stale (>1 hour).
// DO NOT EDIT — managed by NLC. Run `nlc update` to get latest version.

const fs = require('fs');
const path = require('path');

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

function findHandoff(cwd) {
  const home = getHome();
  const key = cwdToProjectKey(cwd);
  const lowerKey = key.replace(/^([A-Z])/, (m) => m.toLowerCase());

  const candidates = [
    path.join(home, '.claude', 'projects', lowerKey, 'memory', 'session-handoff.md'),
    path.join(home, '.claude', 'projects', key, 'memory', 'session-handoff.md'),
    path.join(home, '.nlc', 'projects', lowerKey, 'session-handoff.md'),
    path.join(home, '.nlc', 'projects', key, 'session-handoff.md'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);
    const cwd = hookData.cwd || hookData.session_cwd || process.cwd();
    const handoffPath = findHandoff(cwd);

    if (!handoffPath) process.exit(0);

    const stats = fs.statSync(handoffPath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours > 1) {
      const hours = Math.floor(ageHours);
      console.log(
        `[NLC MEMORY] session-handoff.md was last updated ${hours} hour${hours !== 1 ? 's' : ''} ago. ` +
        `Update it with current session progress. Also update MEMORY.md if setup state has changed.`
      );
    }
  } catch (e) {
    process.exit(0);
  }
});
