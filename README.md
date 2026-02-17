# Nex Level Code (NLC)

**Turn your AI coding assistant into an agent that never forgets.**

One command. Persistent memory. Cross-device sync. Automatic task logging. Behavioral rules that actually stick. No infrastructure to manage, no Docker to run, no open ports, no attack surface.

```bash
npx nex-level-code install
```

Works with Claude Code, Cursor, GitHub Copilot, Windsurf, and OpenAI Codex.

---

## The Problem

AI coding assistants are powerful — but they're goldfish.

Every session starts from zero. Your agent doesn't know what it built yesterday, what decisions you made last week, or what's currently broken. You end up repeating context, re-explaining architecture, and watching it make the same mistakes you already corrected.

Platforms like [OpenClaw](https://github.com/nicepkg/openclaw) solve this with a full agent gateway — 43+ messaging channels, Docker sandboxing, vector databases, device control. But that means running infrastructure, managing ports, configuring databases, and accepting a massive attack surface.

**NLC takes a different approach.** Instead of replacing your tools, it enhances them. Your agent gets persistent memory, session continuity, and cross-device sync — with zero infrastructure. Just files, git, and hooks.

| | OpenClaw | Claude Code + NLC |
|---|---------|-------------------|
| **Memory** | Vector DB (LanceDB) | Flat files + git sync |
| **Session continuity** | JSONL + /compact | session-handoff.md + compaction |
| **Cross-device sync** | Not built-in | Git-backed, automatic |
| **Auto task logging** | None | Haiku-powered semantic logging |
| **IDE integration** | None | Native (VS Code, etc.) |
| **Attack surface** | WebSocket gateway, 43 channels, device control | Zero network-facing components |
| **Setup** | Docker + config + multiple services | `npx nex-level-code install` |
| **Cost** | Self-hosted + API keys | Your existing subscription ($20–$200/mo) |

---

## What You Get

### In the Box (default install)

#### 1. Memory Protocol
Your agent follows a strict memory protocol — reading context at session start, updating it incrementally as it works, and never losing progress.

- **session-handoff.md** — Living document of what's working, what's broken, key decisions, and current focus. Updated during work, not just at the end.
- **MEMORY.md** — Project overview, architecture notes, user preferences, setup state. The agent's long-term knowledge base.
- **Staleness warnings** — If memory files haven't been updated in over an hour, the agent gets a nudge.

#### 2. Automatic Development Logging
Every time the agent completes a meaningful task, it's logged automatically. No manual notes needed.

- Fires on every agent response via a Stop hook
- Sends the exchange to Claude Haiku for semantic analysis: *"Was a real task completed here?"*
- If yes, logs 1–2 lines to `memory/YYYY-MM-DD.md` with a timestamp
- Next session automatically sees yesterday's and today's logs
- Filters out noise — reading files, asking questions, and planning don't count

#### 3. Behavioral Rules
Pre-configured rules that make your agent actually useful:

- **Never ask permission to read** — files, URLs, docs. Just read them.
- **Always ask before writing** — no surprise edits to your codebase.
- **Log every decision** — when you make a call, it's recorded with context.
- **PREVC workflow** — Planning, Review, Execution, Validation, Confirmation. Scales from quick bug fixes (just Execute + Validate) to complex features (full cycle).
- **Communication style** — concise, direct, no false confidence, distinguishes solutions from workarounds.

#### 4. Auto-Permissions
Pre-approves common tool permissions (Bash, Read, Edit, Write, Grep, Glob, WebFetch, WebSearch) so you're not clicking "Allow" on every action.

#### 5. MCP Server
NLC registers an MCP server that gives your agent programmatic access to:

| Tool | What it does |
|------|-------------|
| `nlc-status` | Check NLC installation health |
| `nlc-handoff` | Read or update session-handoff.md |
| `nlc-memory` | Read or update MEMORY.md |
| `nlc-log` | Read development logs by date range |
| `nlc-doctor` | Run diagnostics and get a health report |

#### 6. Multi-Tool Support
NLC detects which AI coding tools you have installed and configures accordingly:

| Tool | Hooks | Rules File | MCP |
|------|-------|-----------|-----|
| **Claude Code** | Full support (5 events) | CLAUDE.md | .mcp.json |
| **Cursor** | Pending | .cursorrules | .cursor/mcp.json |
| **GitHub Copilot** | — | .github/copilot-instructions.md | .github/mcp.json |
| **Windsurf** | Pending | .windsurfrules | .windsurf/mcp.json |
| **OpenAI Codex** | — | AGENTS.md | .codex/mcp.json |

---

### Optional Add-Ons

#### Cross-Device Memory Sync

```bash
nlc sync setup
```

Share your agent's brain across machines. Work on your desktop, close the laptop, continue from your phone or a VPS — your agent picks up exactly where it left off.

- Creates a private GitHub repo for your memory files
- Installs hooks: **SessionStart** pulls latest, **Stop** pushes updates
- Syncs MEMORY.md, session-handoff.md, CLAUDE.md, and daily dev logs
- Content-based diffing — only syncs when files actually change
- Works across Windows, macOS, and Linux

**How it works:**
```
Desktop (Stop hook) → git push → GitHub → git pull → VPS (SessionStart hook)
```

Run `nlc sync setup` on each machine. That's it.

#### Web UI (Self-Hosted)

Access Claude Code from any browser — phone, tablet, another computer — with a clean web interface.

Based on [claudecodeui](https://github.com/siteboon/claudecodeui) with **9 production patches** applied:

| Patch | Problem Fixed |
|-------|--------------|
| Processing hang fix | UI stuck on "Processing..." for up to 5 minutes |
| Auto-approve tools | No more "Allow/Deny" popups for every action |
| Inline questions | Agent questions appear in chat, not hijacking the input |
| Textarea always enabled | Type your next message while the agent works |
| Crash handlers | Graceful shutdown, no orphaned processes |
| Abort on disconnect | Closing browser stops the API call (saves money) |
| JWT secret | Real secret, not the open-source default |
| Dead code cleanup | Removed unused imports and props |
| HTTPS + Firewall | nginx reverse proxy, Let's Encrypt SSL, locked-down ports |

> Setup guide: `nlc webui setup` *(coming soon — currently documented in [claude-code-webui.md](claude-code-webui.md))*

#### Messaging Relay (Telegram + Discord)

Talk to your agent from Telegram or Discord. It reads your project context, uses Claude Code under the hood, and maintains per-channel conversation threads.

- Telegram: DMs with your bot
- Discord: DMs, server channels, smart routing (only responds when relevant)
- Bot-to-bot communication (up to 3 exchanges per channel)
- Session continuity with `/new` to reset

> Setup: See [claude-telegram-relay](https://github.com/godagoo/claude-telegram-relay) — `nlc relay setup` coming soon.

---

## CLI Commands

```bash
nlc install              # Install NLC to detected AI tool
nlc install --tool cursor  # Force a specific tool
nlc install --force      # Overwrite existing installation

nlc status               # Check what's installed and healthy
nlc doctor               # Diagnose issues and auto-fix them
nlc update               # Update NLC scripts to latest version
nlc uninstall            # Remove NLC (preserves your memory files)

nlc sync setup           # Set up cross-device memory sync
nlc sync status          # Check sync health and recent activity

nlc mcp                  # Start the MCP server (usually auto-configured)
```

---

## How It Works

NLC hooks into your AI tool's lifecycle events:

```
┌─────────────────────────────────────────────────────────┐
│  SessionStart                                           │
│  ├─ Pull latest memory from GitHub (if sync enabled)    │
│  └─ Inject memory protocol + recent dev logs            │
│                                                         │
│  UserPromptSubmit                                       │
│  └─ Warn if session-handoff.md is stale (>1 hour)      │
│                                                         │
│  Stop (after each agent response)                       │
│  ├─ Extract preferences/requirements (memory-mcp)       │
│  ├─ Analyze if a task was completed (Haiku)             │
│  ├─ Log to YYYY-MM-DD.md if yes                        │
│  └─ Push memory to GitHub (if sync enabled)             │
│                                                         │
│  PreCompact / SessionEnd                                │
│  └─ Push memory to GitHub (if sync enabled)             │
└─────────────────────────────────────────────────────────┘
```

No servers. No databases. No Docker. Just files and git.

---

## Roadmap

NLC gives you persistent memory and session continuity today. Here's what's coming:

| Feature | Status | Description |
|---------|--------|-------------|
| Memory protocol | ✅ Shipped | session-handoff.md + MEMORY.md |
| Auto dev logging | ✅ Shipped | Haiku-powered task detection |
| Behavioral rules | ✅ Shipped | PREVC workflow + communication style |
| Cross-device sync | ✅ Shipped | Git-backed, automatic |
| MCP server | ✅ Shipped | In-session memory tools |
| Multi-tool support | ✅ Shipped | Claude, Cursor, Copilot, Windsurf, Codex |
| Web UI setup | 🔧 In progress | `nlc webui setup` with auto-patching |
| Relay setup | 🔧 In progress | `nlc relay setup` for Telegram/Discord |
| Browser automation | 📋 Planned | Playwright integration via MCP |
| Voice input/output | 📋 Planned | Whisper STT + TTS |
| Scheduling | 📋 Planned | Cron-based task automation |
| Vector memory | 📋 Planned | Semantic search over project history |

---

## Requirements

- **Node.js** 20+ (for hook scripts)
- **An AI coding tool** — Claude Code, Cursor, GitHub Copilot, Windsurf, or OpenAI Codex
- **GitHub CLI** (`gh`) — only needed for `nlc sync setup`
- **Anthropic API key** — only needed for the auto dev logger (calls Haiku at ~$0.001 per log entry)

---

## Install

```bash
# From npm (recommended)
npx nex-level-code install

# Or install globally
npm install -g nex-level-code
nlc install

# From GitHub (latest)
npx github:ftay1026/nex-level-code install
```

After installing, start a new session in your AI tool. NLC activates automatically.

---

## Uninstall

```bash
nlc uninstall
```

Removes all hooks, scripts, and MCP config. Your memory files (session-handoff.md, MEMORY.md, dev logs) are preserved — they're your data, not ours.

---

## Philosophy

AI coding assistants should remember what they've done, learn from your preferences, and pick up where they left off. They shouldn't need a Kubernetes cluster to do it.

NLC is opinionated:
- **Files over databases** — Markdown files you can read, edit, and version control
- **Git over proprietary sync** — Your memory lives in your own private repo
- **Hooks over agents** — Lightweight lifecycle events, not a separate runtime
- **Enhancement over replacement** — Works with your existing tools, not instead of them

---

## License

MIT

---

Built by [FTay Consulting](https://github.com/ftay1026) with Claude Code + NLC (naturally).
