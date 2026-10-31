#!/usr/bin/env bash
# Long-running build loop for OpenSpec changes.
#
#   scripts/run-loop.sh [--dry-run] [change ...]
#
# For each active change with unticked tasks (or the changes you name):
#   1. build    claude -p "/opsx:apply <change>"   (+ NEXT_FINDINGS.md if present)
#   2. review   claude --agent evaluator           (read-only, PASS / NEEDS_WORK)
#   3. CI       push harness/<change>, open a draft PR, gh pr checks --watch
# A NEEDS_WORK verdict or a red CI run is written to NEXT_FINDINGS.md and fed
# into the next build session. Each session is a fresh context; the handoff is
# tasks.md + git log + NEXT_FINDINGS.md (see CLAUDE.md "Building a change").
#
# Stops on: AGENT_STOP file, MAX_ITERS build sessions, or 2 sessions in a row
# that add no commits. Never archives: a human does that after review.
#
# Env: MAX_ITERS (8), BASE_BRANCH (branch you start from), MAX_BUDGET_USD
#      (per claude session, optional), BUILDER_TOOLS / EVALUATOR_TOOLS (override
#      the allow lists below).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && { DRY_RUN=1; shift; }
MAX_ITERS=${MAX_ITERS:-8}
BASE_BRANCH=${BASE_BRANCH:-$(git branch --show-current)}
LOG_DIR=.harness/logs
FINDINGS=NEXT_FINDINGS.md
export HARNESS_LOOP=1 # turns on the commit-on-stop hook for these sessions only

# Why dontAsk + explicit allow lists: headless sessions can't answer prompts, and
# an allow list is a hard boundary, unlike instructions in a prompt. The builder
# can't push or archive; the evaluator can only read.
BUILDER_TOOLS=${BUILDER_TOOLS:-"Read Glob Grep Edit Write MultiEdit TodoWrite Bash(npm run:*) Bash(npm test:*) Bash(npm ci) Bash(npx:*) Bash(node:*) Bash(openspec:*) Bash(git status:*) Bash(git diff:*) Bash(git log:*) Bash(git show:*) Bash(git add:*) Bash(git commit:*) Bash(mkdir:*) Bash(ls:*) Bash(tee:*)"}
BUILDER_DENY="Bash(openspec archive:*) Bash(git push:*) Skill(opsx:archive) Skill(openspec-archive-change)"
EVALUATOR_TOOLS=${EVALUATOR_TOOLS:-"Read Glob Grep Bash(git log:*) Bash(git diff:*) Bash(git show:*)"}
BUDGET_FLAG=(); [ -n "${MAX_BUDGET_USD:-}" ] && BUDGET_FLAG=(--max-budget-usd "$MAX_BUDGET_USD")

say() { printf '\n\033[1m[loop]\033[0m %s\n' "$*"; }
dry() { printf '  \033[2m[dry-run] would run:\033[0m %s\n' "$*"; }
die() { say "STOP: $*"; exit "${2:-1}"; }

# Tasks left in a change, from the OpenSpec CLI rather than grepping markdown.
remaining() {
  openspec list --json | python3 -c 'import json,sys
c=[x for x in json.load(sys.stdin)["changes"] if x["name"]==sys.argv[1]]
print(c[0]["totalTasks"]-c[0]["completedTasks"] if c else 0)' "$1"
}

# Findings belong to one change; the first line records which.
findings_for() { [ -f "$FINDINGS" ] && head -1 "$FINDINGS" | grep -qx "<!-- change: $1 -->"; }
write_findings() { { echo "<!-- change: $1 -->"; echo "# Findings from $2"; echo; cat; } > "$FINDINGS"; }

# ---- preflight -------------------------------------------------------------
problems=()
command -v claude >/dev/null || problems+=("claude CLI not found")
command -v openspec >/dev/null || problems+=("openspec CLI not found")
command -v gh >/dev/null || problems+=("gh CLI not found (brew install gh && gh auth login)")
command -v gh >/dev/null && ! gh auth status >/dev/null 2>&1 && problems+=("gh is not logged in (gh auth login)")
# Why a clean tree: commit-on-stop uses `commit -am`, which would sweep your
# unrelated work in progress into the harness branch.
[ -n "$(git status --porcelain --untracked-files=no)" ] && problems+=("uncommitted changes in tracked files; commit or stash them first")
[ "$BASE_BRANCH" = "main" ] && problems+=("start from a working branch (e.g. dev), not main")
if [ ${#problems[@]} -gt 0 ]; then
  for p in "${problems[@]}"; do echo "  ! $p"; done
  [ $DRY_RUN = 1 ] && say "Dry run: continuing despite the problems above (a real run would stop here)." || die "fix the problems above"
fi
[ -e AGENT_STOP ] && die "AGENT_STOP exists; remove it to run" 0

if [ $# -gt 0 ]; then
  changes=("$@")
else
  changes=()
  while IFS= read -r c; do changes+=("$c"); done < <(openspec list --json | python3 -c 'import json,sys
for c in json.load(sys.stdin)["changes"]:
    if c["totalTasks"] > c["completedTasks"]: print(c["name"])')
  # Also resume a change whose last cycle left findings, even if all its tasks are ticked.
  if [ -f "$FINDINGS" ]; then
    c=$(head -1 "$FINDINGS" | sed -n 's/^<!-- change: \(.*\) -->$/\1/p')
    [ -n "$c" ] && [[ " ${changes[*]-} " != *" $c "* ]] && changes=("$c" ${changes[@]+"${changes[@]}"})
  fi
fi
[ ${#changes[@]} -eq 0 ] && die "no active change has unticked tasks; nothing to do" 0
say "Changes to build: ${changes[*]}  (base: $BASE_BRANCH, max $MAX_ITERS sessions)"
mkdir -p "$LOG_DIR"

# ---- main loop -------------------------------------------------------------
iter=0
for change in "${changes[@]}"; do
  branch="harness/$change"
  say "== $change on $branch"
  if [ $DRY_RUN = 1 ]; then dry "git switch $branch || git switch -c $branch"
  else git switch "$branch" 2>/dev/null || git switch -c "$branch"; fi
  good=$(git rev-parse HEAD) # last commit that passed review + CI; the evaluator reviews good..HEAD
  stalls=0

  while :; do
    [ -e AGENT_STOP ] && die "AGENT_STOP found" 0
    left=$(remaining "$change")
    if [ "$left" -eq 0 ] && ! findings_for "$change"; then
      say "$change: all tasks ticked, reviewed and green. Not archiving: review the PR, then run /opsx:archive yourself."
      break
    fi
    iter=$((iter + 1))
    [ $iter -gt "$MAX_ITERS" ] && die "reached MAX_ITERS=$MAX_ITERS sessions" 0

    # 1. build ---------------------------------------------------------------
    prompt="/opsx:apply $change

Follow CLAUDE.md \"Building a change\": do only the first task group with unticked tasks, save and Read evidence before ticking each task, commit at each task, then stop. Do not archive."
    if findings_for "$change"; then
      prompt+="

Fix these findings from the last review/CI run first (they are in NEXT_FINDINGS.md):

$(tail -n +2 "$FINDINGS")"
    fi
    say "[$iter] build: $left task(s) left$(findings_for "$change" && echo ', with findings')"
    before=$(git rev-parse HEAD)
    if [ $DRY_RUN = 1 ]; then
      dry "claude -p <prompt below> --permission-mode dontAsk --allowedTools \"$BUILDER_TOOLS\" --disallowedTools \"$BUILDER_DENY\" > $LOG_DIR/$iter-build.log"
      printf '%s\n' "$prompt" | sed 's/^/      | /'
    else
      claude -p "$prompt" --permission-mode dontAsk --allowedTools "$BUILDER_TOOLS" \
        --disallowedTools "$BUILDER_DENY" ${BUDGET_FLAG[@]+"${BUDGET_FLAG[@]}"} > "$LOG_DIR/$iter-build.log" 2>&1 || true
      tail -15 "$LOG_DIR/$iter-build.log"
    fi
    after=$(git rev-parse HEAD)

    if [ "$before" = "$after" ]; then
      stalls=$((stalls + 1))
      say "no new commits ($stalls in a row)"
      [ $DRY_RUN = 1 ] && { say "Dry run: stopping after one simulated pass. A real run continues as described below."; break; }
      [ $stalls -ge 2 ] && die "2 sessions in a row made no commits; see $LOG_DIR/ and the change's tasks.md" 0
      continue
    fi
    stalls=0

    # 2. review --------------------------------------------------------------
    say "[$iter] review: $(git rev-list --count "$good..HEAD") commit(s) in $good..HEAD"
    claude --agent evaluator -p "Change: $change. Review commits $good..HEAD against openspec/changes/$change/specs scenarios and evidence/$change/, per your instructions." \
      --permission-mode dontAsk --allowedTools "$EVALUATOR_TOOLS" ${BUDGET_FLAG[@]+"${BUDGET_FLAG[@]}"} \
      > "$LOG_DIR/$iter-review.md" 2>&1 || true
    verdict=$(head -1 "$LOG_DIR/$iter-review.md" | tr -d '[:space:]')
    say "verdict: ${verdict:-<none>}"
    if [ "$verdict" != "PASS" ]; then
      write_findings "$change" "evaluator review of $good..HEAD (session $iter)" < "$LOG_DIR/$iter-review.md"
      continue
    fi

    # 3. push + CI -----------------------------------------------------------
    say "[$iter] push $branch and wait for CI"
    git push -u origin "$branch"
    gh pr view "$branch" >/dev/null 2>&1 || gh pr create --draft --base "$BASE_BRANCH" --head "$branch" \
      --title "$change (harness build)" \
      --body "Built by scripts/run-loop.sh from openspec/changes/$change. Each commit passed the evaluator; evidence is in evidence/$change/. Not archived."
    # Checks take a moment to register after a push; gh exits 1 with "no checks" until then.
    for _ in $(seq 1 18); do gh pr checks "$branch" >/dev/null 2>&1 && break; [ $? -ne 1 ] && break; sleep 10; done
    if gh pr checks "$branch" --watch --fail-fast --interval 30; then
      say "CI green"
      rm -f "$FINDINGS"
      good=$(git rev-parse HEAD)
    else
      sha=$(git rev-parse HEAD)
      {
        echo "CI failed on $sha."; echo; echo '```'; gh pr checks "$branch" 2>&1 || true; echo '```'
        for id in $(gh run list --branch "$branch" --commit "$sha" --json databaseId,conclusion \
                      -q '.[] | select(.conclusion=="failure") | .databaseId'); do
          echo; echo "## Failed log (run $id, last 150 lines)"; echo '```'
          gh run view "$id" --log-failed 2>&1 | tail -150; echo '```'
        done
      } | write_findings "$change" "CI on $sha (session $iter)"
      say "CI red: findings written to $FINDINGS"
    fi
  done
done
say "Done. Logs in $LOG_DIR/."
