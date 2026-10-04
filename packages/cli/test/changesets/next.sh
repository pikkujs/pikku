#!/bin/bash
source "$(dirname "$0")/lib.sh"

FAKEBIN=$SCRATCH/bin
mkdir -p "$FAKEBIN"
cat >"$FAKEBIN/pi" <<EOF
#!/bin/bash
PIKKU_JS="$PIKKU_JS"
EOF
cat >>"$FAKEBIN/pi" <<'EOF'
pk() { node "$PIKKU_JS" "$@" >/dev/null 2>&1; }
work=${@: -2:1}
work=${work#@}
echo "pi run: $(head -1 "$work")" >>"$FAKE_LOG"
case $FAKE_MODE in
  fail) exit 3 ;;
  idle) exit 0 ;;
esac
if grep -q "Merge conflict" "$work"; then
  branch=$(grep -oE 'changeset/[a-z0-9-]+' "$work" | head -1)
  git switch -q "$branch"
  git merge -q main >/dev/null 2>&1
  echo both >f.txt
  git add f.txt
  git commit -qm "merge main into $branch"
  exit 0
fi
for n in $(grep -oE '^## #[0-9]+' "$work" | tr -dc '0-9\n'); do
  pk changes claim --change-ids "$n" --title "Set $n" --claimed-by pi
  git switch -qc "changeset/set-$n" main
  echo "set $n" >f.txt
  git commit -qam "#$n set $n" -m "Change: #$n"
  pk changes done "$n"
done
EOF
chmod +x "$FAKEBIN/pi"
export FAKE_LOG=$SCRATCH/pi.log

agent_repo() {
  fresh_repo "$@"
  mkdir -p .pi/skills/pikku-changes
  echo skill >.pi/skills/pikku-changes/SKILL.md
  echo .pi >>.git/info/exclude
}

loop() { PATH=$FAKEBIN:$PATH pk changes next --exec pi --loop "$@"; }

scenario "nothing open routes nothing"
fresh_repo
expect_contains "$(pk changes next)" "Nothing to do"

scenario "open changes route the changes agent with every change listed"
file_changes One Two
out=$(pk changes next)
expect_contains "$out" "changes agent, skill pikku-changes"
expect_contains "$out" "## #1 One"
expect_contains "$out" "## #2 Two"
expect_contains "$out" "claim one, build it, mark its changes done and stop"

scenario "a live changeset holds the router"
pk changes claim --change-ids 1 --title Waitlist --creates waitlist --claimed-by a >/dev/null
expect_contains "$(pk changes next)" "A changeset is running: Waitlist"

scenario "--parallel routes alongside and says what is running"
out=$(pk changes next --parallel)
expect_contains "$out" "# Already running"
expect_contains "$out" "- Waitlist — creates waitlist"
expect_contains "$out" "--worktree"
expect_absent "$out" "## #1 One" "the running change is offered again"

scenario "--prompt routes the intake agent"
expect_contains "$(pk changes next --prompt 'let members gift a class')" "intake agent"

scenario "next merges a finished changeset itself"
fresh_repo
file_changes One
pk changes claim --change-ids 1 --title One --claimed-by a >/dev/null
git switch -qc changeset/one && commit_change 1 && pk changes done 1 >/dev/null && git switch -q main
out=$(pk changes next)
expect_contains "$out" "Merged One → main"
expect_contains "$out" "Nothing to do"
expect_contains "$(trailers)" "Changeset: $(group_of One)"

scenario "next fast-forwards from the upstream before merging"
fresh_repo
with_remote
file_changes One
pk changes claim --change-ids 1 --title One --claimed-by a >/dev/null
git switch -qc changeset/one && commit_change 1 && pk changes done 1 >/dev/null && git switch -q main
git clone -q "$REPO.git" "$SCRATCH/other" && (cd "$SCRATCH/other" && echo up >up.txt && git add up.txt && git commit -qm upstream && git push -q)
upstream=$(git -C "$SCRATCH/other" rev-parse HEAD)
expect_ok pk changes next
expect_ok git merge-base --is-ancestor "$upstream" HEAD

scenario "next stops when the branch and its upstream have both moved on"
fresh_repo
with_remote
file_changes One
pk changes claim --change-ids 1 --title One --claimed-by a >/dev/null
git switch -qc changeset/one && commit_change 1 && pk changes done 1 >/dev/null && git switch -q main
echo local >local.txt && git add local.txt && git commit -qm local
rm -rf "$SCRATCH/other"
git clone -q "$REPO.git" "$SCRATCH/other" && (cd "$SCRATCH/other" && echo up >up.txt && git add up.txt && git commit -qm upstream && git push -q)
expect_refused pk changes next
expect_contains "$REFUSAL" "have both moved on"

scenario "--loop merges each changeset, hands a conflict back, merges it, pushes"
agent_repo
with_remote
file_changes One Two
: >"$FAKE_LOG"
out=$(FAKE_MODE=build loop --push)
expect_contains "$out" "Merged Set 1 → main"
expect_contains "$out" "Merged Set 2 → main"
expect_contains "$out" "Nothing to do"
expect_contains "$(cat "$FAKE_LOG")" "pi run: # Merge conflict"
expect_eq "$(cat f.txt)" "both"
expect_eq "$(git branch --show-current)" "main" "the loop returns to the branch it started on"
expect_eq "$(git rev-parse origin/main)" "$(git rev-parse HEAD)" "--push sends the merges"
expect_eq "$(git log --format='%(trailers:key=Changeset,valueonly)' | grep -c .)" "2"

scenario "an agent that leaves the work untouched ends the loop"
agent_repo
file_changes One
expect_contains "$(FAKE_MODE=idle loop)" "left the same work untouched"

scenario "an agent that fails stops the loop"
agent_repo
file_changes One
failing_loop() { FAKE_MODE=fail loop; }
expect_refused failing_loop
expect_contains "$REFUSAL" "exited with 3"

finish
