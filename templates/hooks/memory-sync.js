#!/usr/bin/env node
// nlc-memory-sync.js — Memory sync hook (NLC)
// Syncs memory files between local Claude memory dir and a shared git repo.
// This enables multiple machines/instances to share the same "brain."
//
// Called as a hook:
//   SessionStart → pull (repo → local memory)
//   Stop/PreCompact/SessionEnd → push (local memory → repo)
//
// Config: NLC_MEMORY_REPO env var, or auto-detects from standard locations.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Config ---
const SYNC_FILES = ['MEMORY.md', 'session-handoff.md'];
const DEV_LOG_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;

// --- Find the shared memory repo ---
function findRepo() {
  const home = process.env.USERPROFILE || process.env.HOME || '';

  if (process.env.NLC_MEMORY_REPO && fs.existsSync(process.env.NLC_MEMORY_REPO)) {
    return process.env.NLC_MEMORY_REPO;
  }

  const candidates = [
    path.join(home, 'nex-memory'),
    path.join(home, 'nlc-memory'),
  ];

  // Also check common dev directories on Windows
  if (process.platform === 'win32') {
    const drives = ['C', 'D', 'E'];
    for (const d of drives) {
      candidates.push(path.join(`${d}:`, 'nex-memory'));
      candidates.push(path.join(`${d}:`, 'dev', 'nex-memory'));
    }
  }

  for (const p of candidates) {
    if (fs.existsSync(path.join(p, '.git'))) return p;
  }

  return null;
}

// --- Find local memory dir for current project ---
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
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

// --- Git operations ---
function gitPull(repoPath) {
  try {
    execSync('git pull --rebase --quiet', { cwd: repoPath, timeout: 15000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function gitPush(repoPath) {
  try {
    gitPull(repoPath);

    execSync('git add -A', { cwd: repoPath, timeout: 5000, stdio: 'pipe' });

    try {
      execSync('git diff --cached --quiet', { cwd: repoPath, timeout: 5000, stdio: 'pipe' });
      return true; // No changes
    } catch {
      // Has staged changes
    }

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const hostname = require('os').hostname();
    execSync(
      `git commit -m "sync: ${hostname} @ ${timestamp}"`,
      { cwd: repoPath, timeout: 10000, stdio: 'pipe' }
    );
    execSync('git push --quiet', { cwd: repoPath, timeout: 15000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// --- File sync ---
function getFilesToSync(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f =>
    SYNC_FILES.includes(f) || DEV_LOG_PATTERN.test(f)
  );
}

function copyIfDifferent(src, dst) {
  if (!fs.existsSync(src)) return false;

  if (!fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    return true;
  }

  const srcContent = fs.readFileSync(src, 'utf-8');
  const dstContent = fs.readFileSync(dst, 'utf-8');
  if (srcContent !== dstContent) {
    fs.copyFileSync(src, dst);
    return true;
  }

  return false;
}

function syncPull(repoPath, memoryDir) {
  gitPull(repoPath);

  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

  const files = getFilesToSync(repoPath);
  let copied = 0;
  for (const f of files) {
    if (copyIfDifferent(path.join(repoPath, f), path.join(memoryDir, f))) copied++;
  }
  return copied;
}

function syncPush(repoPath, memoryDir) {
  if (!fs.existsSync(memoryDir)) return 0;

  const files = getFilesToSync(memoryDir);
  let copied = 0;
  for (const f of files) {
    if (copyIfDifferent(path.join(memoryDir, f), path.join(repoPath, f))) copied++;
  }

  // Also pull files that only exist in repo (from other machine)
  const repoFiles = getFilesToSync(repoPath);
  for (const f of repoFiles) {
    if (!files.includes(f)) {
      if (copyIfDifferent(path.join(repoPath, f), path.join(memoryDir, f))) copied++;
    }
  }

  gitPush(repoPath);
  return copied;
}

// --- Main ---
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);
    const cwd = hookData.cwd || hookData.session_cwd || process.cwd();
    const hookType = hookData.hook_type || hookData.type || '';

    const repoPath = findRepo();
    if (!repoPath) return; // No repo found, skip silently

    const memoryDir = getMemoryDir(cwd);

    if (hookType === 'SessionStart' || hookType === 'session_start') {
      syncPull(repoPath, memoryDir);
    } else {
      syncPush(repoPath, memoryDir);
    }
  } catch {
    // Silent failure — never disrupt the agent's work
  }
});
