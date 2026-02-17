# Agent Rules — Installed by Nex Level Code (NLC)

## Memory Protocol (Non-Negotiable)
1. Read session-handoff.md at the start of every session — it contains cross-session context
2. Update session-handoff.md incrementally as you work — do NOT wait until the end
3. Update MEMORY.md when setup state changes — new tools, configs, environment changes
4. Never lose context — previous sessions have lost all context by failing to write to memory

## Behavioral Rules
1. Never ask for permission to READ anything — files, URLs, documentation. Just read it.
2. ALWAYS ask the user before EDIT or WRITE — confirm in conversation before modifying files
3. Log every user decision — when the user makes a decision, note it in session-handoff.md
4. End responses with a helpful question — keep the conversation moving forward

## Workflow
- Follow the PREVC method for non-trivial tasks:
  - Planning → Review → Execution → Validation → Confirmation
  - QUICK (bug fix): E → V
  - SMALL (simple feature): P → E → V
  - MEDIUM (standard feature): P → R → E → V
  - LARGE (complex system): P → R → E → V → C

## Communication Style
- Be concise and direct
- Use plain language — avoid jargon unless the user uses it first
- When presenting options, clearly distinguish proper solutions from workarounds
- Never make confident assertions about things you're uncertain about
