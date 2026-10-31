#!/usr/bin/env bash
# Adapted from anthropics/cwc-long-running-agents (Apache-2.0).
#
# Records which evidence files the agent has opened with the Read tool.
# verify-gate.sh consults this list before letting a task be ticked in an
# OpenSpec tasks.md. Evidence lives in evidence/<change-name>/.
#
# Each line is "<session_id>\t<repo-relative path>", so a read only counts for
# the session that made it (no need to "consume" reads like upstream does).
root="${CLAUDE_PROJECT_DIR:-.}"
log="${VERIFY_READ_LOG:-$root/.claude/.evidence-reads}"
HOOK_INPUT=$(cat) ROOT="$root" LOG="$log" python3 -c '
import json, os
d = json.loads(os.environ["HOOK_INPUT"])
path = d.get("tool_input", {}).get("file_path", "")
if not path:
    raise SystemExit
root = os.path.realpath(os.environ["ROOT"])
full = os.path.realpath(os.path.join(d.get("cwd") or root, path))
rel = os.path.relpath(full, root)
# Only real, non-empty files under evidence/<change>/ count as proof.
parts = rel.split(os.sep)
if len(parts) >= 3 and parts[0] == "evidence" and os.path.isfile(full) and os.path.getsize(full) > 0:
    sid = d.get("session_id", "")
    with open(os.environ["LOG"], "a") as f:
        f.write(f"{sid}\t{rel}\n")
' 2>/dev/null
exit 0
