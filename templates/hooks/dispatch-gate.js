#!/usr/bin/env node
// dispatch-gate.js — PreToolUse hook for Bash
// Blocks the main Opus thread from executing ANY Bash commands directly.
// ALL work — including reading, investigation, SSH, git — must go through sub-agents.
// Sub-agents are exempt (they can run anything).

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const hookData = JSON.parse(input);

    // If this is running inside a sub-agent, allow everything.
    // Sub-agents have session IDs or transcript paths that differ from the main thread.
    // The hook receives tool_input for PreToolUse events.
    const sessionId = hookData.session_id || '';
    const transcriptPath = hookData.transcript_path || '';

    // Sub-agent detection: sub-agents run in nested contexts.
    // When Claude Code spawns a Task, the sub-agent gets its own transcript.
    // The main thread's transcript is in the root sessions directory.
    // Sub-agent transcripts contain path segments like "subagent" or are nested deeper.
    if (transcriptPath.includes('subagent')) {
      process.exit(0); // Allow — this is a sub-agent
      return;
    }

    // For the main thread: block ALL Bash commands
    const command = (hookData.tool_input && hookData.tool_input.command) || '';

    // Small allowlist for truly trivial commands that don't warrant a sub-agent:
    // - pwd (just checking where we are)
    // - echo with no redirect (just printing)
    // None. The user wants ALL commands dispatched.

    // Block the command
    const output = JSON.stringify({
      decision: "block",
      reason:
        `DISPATCH GATE: The main thread cannot run Bash commands directly. ` +
        `Dispatch this to a sub-agent using the Task tool. ` +
        `For SSH/VPS work: use subagent_type="Bash" with model="haiku". ` +
        `For code changes: use subagent_type="general-purpose" with model="sonnet" or "opus". ` +
        `For investigation: use subagent_type="Explore" with model="haiku". ` +
        `Command that was blocked: "${command.slice(0, 120)}"`
    });
    console.log(output);
    process.exit(0);

  } catch (e) {
    // On error, allow the command (fail-open to avoid blocking all work)
    process.exit(0);
  }
});
