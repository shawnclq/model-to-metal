#!/usr/bin/env bash
# Keeps the plan fixed while agents build against it. Denies edits to:
#   openspec/changes/<change>/proposal.md, design.md, specs/**  (incl. archive/)
#   openspec/specs/**
# tasks.md stays editable (ticking tasks, "Done:" notes); verify-gate.sh guards it.
#
# Why: if the builder could rewrite the spec, it could make failing work "pass"
# by moving the goalposts. Plan changes go through /opsx:update by a human.
#
# Override for planning sessions (/opsx:propose, /opsx:update, /opsx:sync):
#   ALLOW_SPEC_EDITS=1 claude
# The agent can't set this itself: hooks read the env of the claude process.
#
# Bash writes are caught by a heuristic (sed -i, >, tee, mv, cp, rm...), not a
# security boundary.
[ "${ALLOW_SPEC_EDITS:-}" = "1" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-.}"
HOOK_INPUT=$(cat) ROOT="$root" python3 -c '
import json, os, re
d = json.loads(os.environ["HOOK_INPUT"])
tool, ti = d.get("tool_name", ""), d.get("tool_input", {})
root = os.path.realpath(os.environ["ROOT"])
PROTECTED = r"openspec/(specs/|changes/archive/|changes/[^/\s]+/(proposal\.md|design\.md|specs/))"

def deny(what):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
        "permissionDecision": "deny", "permissionDecisionReason":
        f"{what} is part of the approved OpenSpec plan and is read-only for agents. "
        "If the plan is wrong, stop and say so in your final message; a human will run /opsx:update."}}))
    raise SystemExit

if tool == "Bash":
    cmd = ti.get("command", "")
    if re.search(PROTECTED, cmd) and \
       re.search(r"sed\s+-i|perl\s+-[a-z]*i|>|\btee\b|\bmv\b|\bcp\b|\brm\b|\btouch\b|python|\bawk\b", cmd):
        deny("That command writes to a protected OpenSpec file, which")
    raise SystemExit

path = ti.get("file_path") or ti.get("notebook_path") or ""
if path:
    rel = os.path.relpath(os.path.realpath(os.path.join(d.get("cwd") or root, path)), root)
    if re.match(PROTECTED, rel):
        deny(rel)
'
exit 0
