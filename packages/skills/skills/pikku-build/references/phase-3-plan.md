# Phase 3 — The plan (§5, §5a)

Part of the app workflow (`app.md` is the index and the rules that hold throughout). File the work, and plan each changeset that needs it.

## 5. File the work as changes

Turn the app into changes on the project's queue — the pikku-changes skill.
`pikku knowledge gaps` lists every note no change builds yet; file each as one
or more changes with `pikku changes file`, one commit's worth each, and
end every body with the gap's `Knowledge:` line so it is not filed twice.

What a change is:

- **One commit's worth.** "The owner sees this month's arrears" is a change,
  or a few. "Add the database schema" is not; it is a step inside one.
- **It ends in something a person can do**, in a browser, signed in as a named
  virtual user. If you cannot say what they see when it is done, that is a
  `questions/` note, not a change.

If §1's screen mock was made — approved, or drawn because nobody answered —
every screen on that page belongs to some change, and a screen no change builds
is a hole in this plan.

How they group into changesets, in order:

1. **The spine first.** The one object everything else hangs off, and the screen
   that proves the app exists at all.
2. **Then the loop the user named as "the main thing someone does on their first
   visit."** That answer from §1 is the second changeset, not the tenth.
3. **Then each audience's own surface**, one at a time. With two apps, finish one
   app's spine before starting the other's — a half-built app in each is worse
   than one working app.
4. **Refusals ride along with the changeset that creates the thing being
   refused**, never as a "permissions" changeset at the end.

**One approval, then build to the end.** Show the picture of the screens and
the changes together, in one message, as the plan. That is the only approval you
ask for. Once they approve it, or don't answer, run `pikku changes next --exec <harness>
--loop`: it hands each changeset to a fresh agent, merges it, and moves on. Post
one line as each changeset merges, and carry on. Stop only for what is theirs to
decide: a credential you don't have, spending money, posting in public, deleting
or overwriting their data, or a finding that changes the plan.

## 5a. The technical plan — per changeset, before you build it

`pikku changes claim` decides whether a changeset needs a **plan**: one
that creates or alters a table always does, and the judge decides the rest. The
plan says what has to exist: the tables, functions, wires, roles, scopes,
screens and scenarios, split into passes. It is JSON at
`knowledge/plans/<changeset>.plan.json`, committed on the changeset's branch,
and `pikku knowledge plan progress` measures the finished build against it.

**Read `pikku-architect` and follow it.** The plan is written in its own turn,
before any of the code it measures exists, and is never edited afterwards to
match what you ended up building. An item that will not land is deferred with
its reason — `plan defer` — not quietly rewritten:

```sh
pikku knowledge plan schema                        # the only spec there is
pikku knowledge plan set <changeset> /tmp/plan.json
pikku knowledge plan show <changeset> --for-build  # what you then build
```
