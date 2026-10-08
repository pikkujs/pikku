---
name: pikku-changes
description: 'Work a project''s changes queue — the todo list someone filed by circling things on a deployed stage. Covers `pikku changes wait|claim|show|ask|reply|shot|done`: waiting for work without polling, asking instead of guessing, saying why an item is left undone, offering options as images, one commit per item. TRIGGER when: the user says "run the pikkufabric changes", "run the changes against <stage>", "work the changes (queue)", "watch the changes", "pick up the changes", names a change by its #number, or you are otherwise idle in a checkout with open changes (`pikku changes list`). DO NOT TRIGGER for git changes, diffs or changelogs, and not for deploying or debugging a stage — use pikku-fabric for those.'
installGroups: [fabric]
---

# Working a changes queue

Someone walked the deployed app and circled things. Each item is their words, a
screenshot of what they saw, and the elements the circle enclosed. You have the repo.
Empty the queue without making them regret filing.

Run every command from the checkout. Where the queue lives depends on the project. A project that is not
linked to Fabric keeps it in the checkout (`.git/pikku-changes.json`, shared by every worktree). A project linked
to Fabric (`FABRIC_PROJECT_ID`, or `fabric.projectId` in `pikku.config.json`) keeps it in Fabric only, and needs
you online and signed in (`FABRIC_TOKEN`, or `pikku fabric login`); a command that cannot reach Fabric fails
and changes nothing.
`--json` works on all of them. Items are addressed as `2`, `#2` or their uuid.

**Launched by `pikku changes next`?** `pikku changes next` picks one agent: a merge conflict or a changeset with no plan
goes back to a changes agent; open changes go to a changes agent; a pikku version bump goes to an
upgrade agent, and knowledge no change builds yet (`pikku knowledge gaps`) to a knowledge agent — both
of those only file changes. A change filed for a gap ends its body with the gap's `Knowledge:` line.
As a changes agent, your work file already lists every open change. Skip the loop below,
group them into changesets, and take one: claim it, build it, mark its items done, stop. `pikku changes next --loop`
starts a fresh agent for the next one, so nothing you hold in context carries over — whatever the next
changeset needs to know goes in a commit or a `reply`.

## The loop

**Never poll.** No `sleep` loops, no repeated `list`, no re-running `show` to see if
something changed. `wait` does the waiting and exits only when there is work.

1. Start `wait` as a **background** command, and stop there until it exits:

   ```bash
   pikku changes wait --claim --claimed-by claude-code
   ```

   It waits out the grace window (a just-filed item is held about a minute so a batch
   being typed arrives together), claims what is ready as one group, prints it, and
   exits. It also wakes when someone answers a question you asked under that
   `--claimed-by`. It checks every `--interval` seconds.

2. When it exits, read the exit code:

   | code | meaning                                                | do                                              |
   | ---- | ------------------------------------------------------ | ----------------------------------------------- |
   | 0    | work printed (claimed, and/or `Answered`)              | work it, then step 3                            |
   | 2    | `--timeout`/`--once` found nothing                     | stop, or restart `wait`                         |
   | 3    | session refused                                        | tell the user to run `pikku fabric login`; stop |
   | 1    | anything else                                          | report the message; stop                        |

3. For each item: `show` → fix → commit → `done`; or `ask` and move on; or `reply`
   saying why you are leaving it. Then start `wait` again, in the background.

Without `--claim` it only reports what is claimable; claim it yourself:

```bash
pikku changes claim --change-ids 3,4 --title "Checkout pass" --claimed-by claude-code
```

A `claim` refused with a 409 says per item why — held for the filer, inside another
group's lease, done — and when a held or leased item is **claimable at** (a local
`HH:MM`; `list` and `show` print the same). An item inside someone else's live lease
cannot be taken. For held items, run `wait --claim` rather than retrying. The lease is 30 minutes
(`--lease-minutes`); an abandoned claim returns to the queue by itself.

## Changesets

Group related items into changesets and claim each one as a group, saying which tables it touches —
the entity notes' `resource:` lines name them:

```bash
pikku changes claim --change-ids 1,3 --title "Waitlist" --claimed-by pi --creates waitlist --reads booking
```

The claim says whether the changeset needs a plan, and why: one that creates or alters a table, or
has many changes, always does; anything else goes to the judge configured with
`PIKKU_PLAN_JUDGE_URL` (any endpoint answering `{verdict, reason}` to `{question, context}`), and a
judge that fails says plan. With no judge configured only the fixed rules apply. `--needs-plan
true|false` overrides all of it.

A planned changeset is planned before any code, with the pikku-architect skill:
`pikku knowledge plan set <groupId> <file>` writes `knowledge/plans/<groupId>.plan.json`; commit it on
the changeset's branch. `done` refuses the first change until the plan reads and the last until
`pikku knowledge plan progress <groupId>` is clean, and `pikku changes next` will not merge a planned
changeset whose branch has no plan.

Build each changeset on its own branch, `changeset/<slug>`, cut from the branch you started on, one
commit per item (see Committing), and mark each item `done`. Launched by `pikku changes next`, stop there:
it merges finished changesets itself, as one `--no-ff` commit with a `Changeset:` trailer, and if the
merge conflicts it hands that back to an agent to resolve on the changeset's branch. Working by hand,
merge it yourself from the branch it goes into:

```bash
pikku changes merge --group-id <id>
```

Never `git merge` a changeset branch yourself — a fast-forward leaves no changeset commit, and
`changes merge` refuses a branch that is already in.

Changesets that create or alter tables go one at a time; one that reads a table waits for the
changeset creating it; the rest can run side by side. On the local queue, `claim` refuses a changeset
that would break that order, and `done` refuses a commit that adds a migration under `db/` when its
changeset declared no `--creates`/`--alters`.

When other agents are working changesets at the same time (your work says so), claim with
`--worktree`: it creates `changeset/<slug>` in its own checkout beside the repo and prints the path.
Build and commit there and run `done` there; the merge removes the worktree. If the claim is refused because of a running changeset, claim one that does not
clash, or stop.

## Reading an item

`pikku changes show 3` gives, most trustworthy first:

1. **Their words.** The title and body are the requirement. Everything else is evidence.
2. **The screenshot.** What they saw, at their width, with their data. When the other
   addresses disagree with the picture, the picture is right.
3. **The circled elements**: a testid (greps straight to a component, it is the i18n
   key), a source anchor, a CSS path.
4. **The source anchor**, `src/routes/app.orders.tsx:42 as of a91c4e2`, is where the JSX
   was at _that_ commit. Find today's equivalent; never edit line 42 because it said 42.

## When to ask

Ask when the item admits more than one reasonable implementation and you would be
picking for them — "make the total stand out" (bigger? bolder? moved?), anything that
changes stored data, what an existing user sees, or what something costs. Do not ask
what the item already says, or implementation choices that are yours.

One decision, in their vocabulary, with the choices as `--option` flags — each becomes
a button. Include "hold until I check" when it is real. Batch questions per group.

```bash
pikku changes ask --change-id 3 --question "Make the total stand out — which way?" \
  --option "Bigger" --option "Move it above the delivery line" --author-name claude-code
```

Then **park it** and move on. The answer wakes `wait` (same `--claimed-by`); it prints
under `Answered`, and `show` has the reply.

If the answer is visual and you can build it, build each variant, screenshot all of
them in one pass at one width (baseline included), and attach them — the panel turns
`--kind option` shots into a pick-one:

```bash
pikku changes shot --change-id 3 --label "Bigger" --kind option --image a.png
```

`--kind evidence` is a picture that proves something, shown inline.

## Replying without asking

`ask` is for a decision you need from them: it parks the item as needing an answer.
`done` closes it. Everything else you have to say goes in a `reply`, which leaves the
item's status exactly where it was:

- you are not doing it, and why ("the copy comes from the CMS, not the app");
- it is blocked on something that is not a question ("needs STRIPE_KEY set on the stage");
- you could not reproduce it — attach what you saw.

```bash
pikku changes reply 3 --message "Cannot reproduce on develop @ a91c4e2 — this is what I see." \
  --image seen.png --image-label "develop @ a91c4e2" --author-name claude-code
```

Never `ask` a question you do not need answered just to leave a note, and never
`done --note` an item you did not do — both tell the filer the wrong thing.

## Committing

One item, one commit — `done` records one sha, and that is what a human reverts. The
subject carries the short id; the uuid goes in a trailer:

```
fix(booking): #7 stop the date picker closing on the first click

Change-Id: 0f3c8a12-9b44-4d2e-8f01-27c6a1d9e5b3
```

Scope names the screen they were looking at, not the file you edited.

## Finishing

```bash
pikku changes done --change-id 7 --note "What you did, for whoever reads the thread"
```

Branch and commit default to the checkout you are in — run it there, never type a sha. `done` finds the item's commit by its `Change-Id` trailer, so close items in any order.
An item you decided not to do is not `done`: `reply` with why and leave it for a
human to dismiss.

Registering writes with Fabric needs the `changes:project:write` scope.
