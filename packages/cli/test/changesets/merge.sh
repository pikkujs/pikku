#!/bin/bash
source "$(dirname "$0")/lib.sh"

build() {
  local n=$1 title=$2 content=${3:-change $1}
  pk fabric changes claim --change-ids "$n" --title "$title" --claimed-by a >/dev/null
  git switch -qc "changeset/$n" main
  commit_change "$n" "$content"
  pk fabric changes done "$n" >/dev/null
  git switch -q main
}

scenario "merge is refused until every change is done"
fresh_repo
file_changes One Two
pk fabric changes claim --change-ids 1,2 --title Pair --claimed-by a >/dev/null
git switch -qc changeset/pair
commit_change 1
pk fabric changes done 1 >/dev/null
git switch -q main
expect_refused pk fabric changes merge --group-id "$(group_of Pair)"
expect_contains "$REFUSAL" "Not done yet: #2"

scenario "merge is refused from the changeset's own branch"
git switch -q changeset/pair
commit_change 2
pk fabric changes done 2 >/dev/null
expect_refused pk fabric changes merge --group-id "$(group_of Pair)"
expect_contains "$REFUSAL" "on changeset/pair itself"

scenario "merge lands one --no-ff commit with a Changeset trailer and ends the lease"
git switch -q main
expect_ok pk fabric changes merge --group-id "$(group_of Pair)"
expect_eq "$(git log -1 --format=%s)" "Pair"
expect_contains "$(trailers)" "Changeset: $(group_of Pair)"
expect_eq "$(git rev-list --count --merges HEAD)" "1"
expect_eq "$(lease_live Pair)" "false"

scenario "a branch already merged by plain git is refused, and its lease ends"
fresh_repo
file_changes One
build 1 Solo
git merge -q changeset/1
expect_refused pk fabric changes merge --group-id "$(group_of Solo)"
expect_contains "$REFUSAL" "merged by plain git"
expect_eq "$(lease_live Solo)" "false"

scenario "a conflicting merge is aborted and names the files"
fresh_repo
file_changes One Two
build 1 One one
build 2 Two two
expect_ok pk fabric changes merge --group-id "$(group_of One)"
expect_refused pk fabric changes merge --group-id "$(group_of Two)"
expect_contains "$REFUSAL" "conflicts with main in f.txt"
expect_eq "$(git status --porcelain)" "" "the checkout is left clean"

scenario "merge removes the changeset's worktree"
fresh_repo
file_changes Side
pk fabric changes claim --change-ids 1 --title Side --claimed-by a --worktree >/dev/null
(cd "$REPO-changesets/side" && commit_change 1 && pk fabric changes done 1 >/dev/null)
out=$(pk fabric changes merge --group-id "$(group_of Side)")
expect_contains "$out" "removed worktree"
expect_eq "$(git worktree list | wc -l | tr -d ' ')" "1"

finish
