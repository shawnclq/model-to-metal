#!/usr/bin/env bash
# Adapted from anthropics/cwc-long-running-agents (Apache-2.0).
#
# Default-FAIL contract for OpenSpec: denies ticking a task ("- [ ]" -> "- [x]")
# in openspec/changes/<change>/tasks.md (archive/ excluded) unless, in this
# session, the agent has Read an evidence file for that task's group:
#
#   evidence/<change>/<group>-*   or   evidence/<change>/<group>.<n>-*
#   e.g. evidence/modular-web-build/9.1-npm-check.txt unlocks tasks 9.x
#
# Why per group: upstream lets any evidence unlock any row, which its own
# comments list as a gap. Matching the group number closes it cheaply.
#
# Why simulate the whole file: comparing ticked-task IDs before and after the
# edit catches Edit, MultiEdit and Write alike, and ignores unrelated edits
# (e.g. adding a "Done:" note under a task that is already ticked).
#
# Bash writes to tasks.md (sed -i, >, tee...) are denied outright, so the gate
# can't be sidestepped with a shell one-liner. This is a heuristic, not a
# security boundary: an agent determined to bypass it still could.
root="${CLAUDE_PROJECT_DIR:-.}"
log="${VERIFY_READ_LOG:-$root/.claude/.evidence-reads}"
HOOK_INPUT=$(cat) ROOT="$root" LOG="$log" python3 -c '
import json, os, re
d = json.loads(os.environ["HOOK_INPUT"])
tool, ti = d.get("tool_name", ""), d.get("tool_input", {})
root = os.path.realpath(os.environ["ROOT"])

def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
        "permissionDecision": "deny", "permissionDecisionReason": reason}}))
    raise SystemExit

if tool == "Bash":
    # Drop stream plumbing (2>&1, >/dev/null) first so read-only commands aren't mistaken for writes.
    cmd = re.sub(r"\d*>&\d|\d*>\s*/dev/null", "", ti.get("command", ""))
    if re.search(r"openspec/changes/[^\s]*tasks\.md|\btasks\.md\b", cmd) and \
       re.search(r"sed\s+-i|perl\s+-[a-z]*i|>|\btee\b|\bmv\b|\bcp\b|python|\bawk\b", cmd):
        deny("Tick tasks in tasks.md with the Edit tool, not Bash, so the evidence gate can check them.")
    raise SystemExit

path = ti.get("file_path", "")
full = os.path.realpath(os.path.join(d.get("cwd") or root, path)) if path else ""
m = re.fullmatch(r"openspec/changes/([^/]+)/tasks\.md", os.path.relpath(full, root)) if full else None
if not m or m.group(1) == "archive":
    raise SystemExit
change = m.group(1)

before = open(full).read() if os.path.exists(full) else ""
after = before
if tool == "Write":
    after = ti.get("content", "")
else:
    edits = ti.get("edits") or [ti]  # MultiEdit has a list, Edit is one edit
    for e in edits:
        after = after.replace(e.get("old_string", ""), e.get("new_string", ""),
                              -1 if e.get("replace_all") else 1)

TICK = re.compile(r"^\s*- \[[xX]\]\s+(.*)$", re.M)
def ticked(text):
    # Key by task id ("9.1") when present, else by the task text itself.
    out = set()
    for body in TICK.findall(text):
        tid = re.match(r"(\d+)\.(\d+)\b", body)
        out.add(tid.group(0) if tid else body.strip())
    return out

newly = ticked(after) - ticked(before)
if not newly:
    raise SystemExit

reads = []
if os.path.exists(os.environ["LOG"]):
    for line in open(os.environ["LOG"]):
        sid, _, rel = line.rstrip("\n").partition("\t")
        if sid == d.get("session_id", "") and rel.startswith(f"evidence/{change}/"):
            reads.append(os.path.basename(rel))

missing = []
for task in sorted(newly):
    g = re.match(r"(\d+)\.", task)
    ok = any(b.startswith((g.group(1) + ".", g.group(1) + "-")) for b in reads) if g else bool(reads)
    if not ok:
        missing.append(task)
if missing:
    deny(f"Cannot tick {missing} in {change}/tasks.md: no evidence for that task group was Read this session. "
         f"Run the task’s Verify step, save the output to evidence/{change}/<task-id>-<what>.txt "
         f"(e.g. evidence/{change}/9.1-npm-check.txt), open it with the Read tool, then retry.")
'
exit 0
