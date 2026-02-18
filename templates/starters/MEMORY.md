# Project Memory

> Managed by Nex Level Code (NLC). This file persists across sessions.
> Keep it concise — lines after 200 will be truncated in context.

## Project Overview
<!-- What is this project? Tech stack? Main directories? -->

## Key Documents
<!-- Important files the agent should read before making changes. -->

## User Requirements
<!-- Non-negotiable rules the user has established. -->

## User Preferences
<!-- How the user likes to work. Communication style. Tool preferences. -->

## Current Setup State
<!-- What's installed, configured, and running. Update as things change. -->

## Sub-Agent Model Router (Non-Negotiable)

Opus stays as the main conversation thread. ALL tasks are dispatched to sub-agents. The model is selected mechanically — no judgment, no "I think I can handle this."

**Rule 1 — Does the task modify any file?**
- No → **Haiku**
- Yes → go to Rule 2

**Rule 2 — Has Opus already specified ALL THREE?**
- (a) The exact file(s)
- (b) The exact location in the file
- (c) The exact change to make
- All three yes → **Sonnet**
- Missing any one → **Opus**

**Rule 3 — Escape clause**
If a sub-agent encounters ANYTHING unexpected, it **stops and returns to Opus**. No improvising. No "quick fix." No alternative approaches.

**Trigger keyword: "Do it"** — When the user says "Do it", Opus MUST pause and state the routing decision out loud before dispatching.

## Session Protocol
- **START**: Read `session-handoff.md` first
- **END**: Update `session-handoff.md` with what was done + what's next
