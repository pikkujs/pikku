---
'@pikku/cli': patch
---

Add `pikku knowledge next` — the one thing to do next with the knowledge base, derived
from what is on disk rather than from what a previous step remembered to announce.

It answers with exactly one action: repair a note, write a plan, ask the user, dispatch a
build, hold, or nothing. On `ask-user` it prints the question a person should actually be
asked, with its options numbered, and demotes the machine wording to a `why:` line — that
reason names the note and the frontmatter key, and reads as gibberish to somebody who has
never seen a note.
