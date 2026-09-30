---
name: pikku-changes
description: 'Work a Fabric project''s changes queue — the todo list someone filed by circling things on a deployed stage. Covers `pikku fabric changes next|claim|show|ask|shot|done`: waiting for work without polling, asking instead of guessing, offering options as images, one commit per item. TRIGGER when: the user says "run the pikkufabric changes", "run the changes against <stage>", "work the changes (queue)", "watch the changes", "pick up the changes", names a change by its #number, or you are otherwise idle in a checkout linked to a Fabric project (`pikku fabric config` shows one). DO NOT TRIGGER for git changes, diffs or changelogs, and not for deploying or debugging a stage — use pikku-fabric for those.'
installGroups: [fabric]
---

# Working a changes queue

Someone walked the deployed app and circled things. Each item is their words, a
screenshot of what they saw, and the elements the circle enclosed. You have the repo.
Empty the queue without making them regret filing.

Run every command from the checkout: the project comes from its git remote (`pikku fabric config` shows which).
`--json` works on all of them. Items are addressed as `2`, `#2` or their uuid.

## Which stage

The queue is per project. "Against develop" or a pasted stage URL narrows it:
`--stage` takes a branch, the stage URL (as filed, path optional) or a stage id. With
no stage named, work the whole project. An unknown name prints the stages there are.

## The loop

**Never poll.** No `sleep` loops, no repeated `list`, no re-running `show` to see if
something changed. `next` does the waiting and exits only when there is work.

1. Start `next` as a **background** command, and stop there until it exits:

   ```bash
   pikku fabric changes next --stage develop --claim --claimed-by claude-code
   ```

   It waits out the grace window (a just-filed item is held about a minute so a batch
   being typed arrives together), claims what is ready as one group, prints it, and
   exits. It also wakes when someone answers a question you asked under that
   `--claimed-by`.

2. When it exits, read the exit code:

   | code | meaning                                                | do                                              |
   | ---- | ------------------------------------------------------ | ----------------------------------------------- |
   | 0    | work printed (claimed, and/or `Answered`)              | work it, then step 3                            |
   | 2    | `--timeout`/`--once` found nothing                     | stop, or restart `next`                         |
   | 3    | session refused                                        | tell the user to run `pikku fabric login`; stop |
   | 1    | anything else (bad `--stage`, fabric down for minutes) | report the message; stop                        |

3. For each item: `show` → fix → commit → `done`, or `ask` and move on. Then start
   `next` again, in the background.

Without `--claim` it only reports what is claimable; claim it yourself:

```bash
pikku fabric changes claim --change-ids 3,4 --title "Checkout pass" --claimed-by claude-code
```

A `claim` refused with a 409 says per item why (held, claimed by someone else, done).
For held items, run `next --claim` rather than retrying. The lease is 30 minutes
(`--lease-minutes`); an abandoned claim returns to the queue by itself.

## Reading an item

`pikku fabric changes show 3` gives, most trustworthy first:

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
pikku fabric changes ask --change-id 3 --question "Make the total stand out — which way?" \
  --option "Bigger" --option "Move it above the delivery line" --author-name claude-code
```

Then **park it** and move on. The answer wakes `next` (same `--claimed-by`); it prints
under `Answered`, and `show` has the reply.

If the answer is visual and you can build it, build each variant, screenshot all of
them in one pass at one width (baseline included), and attach them — the panel turns
`--kind option` shots into a pick-one:

```bash
pikku fabric changes shot --change-id 3 --label "Bigger" --kind option --image a.png
```

`--kind evidence` is a picture that proves something, shown inline.

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
pikku fabric changes done --change-id 7 --note "What you did, for whoever reads the thread"
```

Branch and commit default to the checkout you are in — run it there, never type a sha.
An item you decided not to do is not `done`: say why in the thread and leave it for a
human to dismiss.

Writes need the `changes:project:write` scope; `list`, `show` and `next` without
`--claim` are reads.
