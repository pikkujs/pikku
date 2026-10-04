#!/bin/bash
source "$(dirname "$0")/lib.sh"

scenario "done finds the change's commit by its trailer, not HEAD"
fresh_repo
file_changes Two Three
pk changes claim --change-ids 1,2 --title Both --claimed-by a >/dev/null
git switch -qc changeset/both
commit_change 1 one
first=$(git rev-parse --short HEAD)
commit_change 2 two
expect_contains "$(pk changes done 1)" "@ $first"

scenario "done accepts a Change-Id trailer"
fresh_repo
file_changes One
uuid=$(node -e "process.stdout.write(require(process.argv[1]).changes[0].changeId)" "$(store)")
echo x >f.txt && git commit -qam "#1 one" -m "Change-Id: $uuid"
expect_ok pk changes done 1

scenario "done is refused when no commit carries the change"
fresh_repo
file_changes One
echo x >f.txt && git commit -qam "unrelated"
expect_refused pk changes done 1
expect_contains "$REFUSAL" "No commit on this branch is #1"

scenario "--change-id works as well as the positional"
fresh_repo
file_changes One
commit_change 1
expect_ok pk changes done --change-id 1

scenario "an undeclared migration is refused"
fresh_repo
file_changes Waitlist
pk changes claim --change-ids 1 --title Waitlist --claimed-by a >/dev/null
commit_change 1 "create table waitlist" db/sqlite/0002-waitlist.sql
expect_refused pk changes done 1
expect_contains "$REFUSAL" "declared no table it creates or alters"

scenario "a declared migration is accepted"
pk changes claim --change-ids 1 --group-id "$(group_of Waitlist)" --creates waitlist --claimed-by a >/dev/null
expect_ok pk changes done 1

finish
