#!/bin/bash
source "$(dirname "$0")/lib.sh"

scenario "a second schema changeset is refused while one runs"
fresh_repo
file_changes Waitlist Cancel Copy Join
expect_ok pk changes claim --change-ids 1 --title Waitlist --creates waitlist --claimed-by a
expect_refused pk changes claim --change-ids 2 --title Cancel --alters class --claimed-by b
expect_contains "$REFUSAL" "“Waitlist” is changing the schema"
expect_absent "$REFUSAL" ": open" "refusal lists item statuses instead of the clash"

scenario "a changeset reading a table being created waits"
expect_refused pk changes claim --change-ids 4 --title Join --reads waitlist --claimed-by b
expect_contains "$REFUSAL" "“Waitlist” is creating waitlist"

scenario "a changeset touching no tables runs alongside"
expect_ok pk changes claim --change-ids 3 --title Copy --reads class --claimed-by b

scenario "creating or altering a table implies a plan"
expect_contains "$(pk changes claim --change-ids 1 --group-id "$(group_of Waitlist)" --claimed-by a)" "needs a plan"

scenario "re-claiming keeps the group's title and declaration"
out=$(pk changes claim --change-ids 1 --group-id "$(group_of Waitlist)" --claimed-by a)
expect_contains "$out" "“Waitlist”"
expect_contains "$out" "creates waitlist"

scenario "a claimed item cannot be taken by another group"
expect_refused pk changes claim --change-ids 1 --title Other --claimed-by c
expect_contains "$REFUSAL" "Already taken: #1"

scenario "--worktree builds the changeset beside the repo on its own branch"
fresh_repo
file_changes "Owner cancels"
out=$(pk changes claim --change-ids 1 --title "Owner cancels" --claimed-by a --worktree)
expect_contains "$out" "Work in $REPO-changesets/owner-cancels"
expect_eq "$(git -C "$REPO-changesets/owner-cancels" branch --show-current)" "changeset/owner-cancels"
expect_eq "$(git branch --show-current)" "main" "the main checkout stays where it was"

finish
