---
name: pikku-changes
description: 'Work a project''s changes queue — the todo list someone filed by walking a deployed stage. Covers `pikku fabric changes list|claim|show|ask|shot|done`, when to ask a question instead of guessing, and how to offer options as images. TRIGGER when: the user says "work the changes", "pick up the changes queue", names a change by its #number, or you are otherwise idle in a repo that has a pikkufabric.config.json. DO NOT TRIGGER for git changes, diffs or changelogs, and not for deploying or debugging a stage — use pikku-fabric for those.'
installGroups: [fabric]
---

# Working a changes queue

Someone walked the deployed app and circled twenty things. Each one is a row with their
words, a picture of what they were looking at, and the elements the circle enclosed. You
have the repo and the app running locally. Your job is to empty the queue without making
them regret filing.

## The loop

Every argument is a flag; nothing is positional. `--json` works on any of them. The
project comes from the local `pikkufabric.config.json`, so `--project-id` is only needed
when you are not in the checkout.

```bash
pikku fabric changes list --pickup-only --json
pikku fabric changes claim --change-ids <id>,<id> --title "Checkout pass" --claimed-by claude-code
pikku fabric changes show --change-id <id>
pikku fabric changes ask --change-id <id> --question "…" --option "…" --option "…" --author-name claude-code
pikku fabric changes shot --change-id <id> --label "Bigger" --kind option --image a.png
pikku fabric changes done --change-id <id> --note "What you did"
```

`list --pickup-only` is the one a harness wants: it skips items still inside the grace
window, so a batch someone is mid-way through typing is picked up together rather than item
by item as it lands.

Deciding what belongs together is yours: `claim` with `--change-ids` and no `--group-id`
forms the group. Claim an existing one with `--group-id`.

Claim before working. The lease expires (30 minutes by default, `--lease-minutes` to
change it), so an abandoned claim returns to the queue rather than parking the work
forever — but a second harness picking up something you are halfway through is the failure
this prevents.

## Reading an item

`show` gives you four things, in descending order of trustworthiness:

1. **Their words.** The title and body are the requirement. Everything else is evidence.
2. **The screenshot.** What they actually saw, at their width, with their data. When the
   other addresses disagree with the picture, the picture is right.
3. **The circled elements** — a testid, a source anchor, a CSS path. The testid greps
   straight to a component because it is the i18n message key.
4. **The source anchor**, printed as `src/routes/app.orders.tsx:42 as of a91c4e2`. That line
   number is where the JSX was **at that commit**. Read it as a starting point and find
   today's equivalent; never edit line 42 of today's file because the anchor said 42.

Resolution is a guess and the panel says so. If the circle and the anchor point at
different things, believe the circle.

## When to ask

Ask when the item admits more than one reasonable implementation and you would be **picking
for them**. Do not ask to confirm something the item already says.

Ask:
- "Make the total stand out" — bigger, bolder, coloured, or moved above the fold?
- "This should be faster" — is it the spinner, the request, or the number of steps?
- Anything that changes what data is stored, what an existing user sees, or what something costs.

Do not ask:
- "Should I use flexbox or grid?" — that is yours.
- "Do you want me to fix the typo?" — they filed it; fix it.
- "Can you confirm you want the button blue?" — they said blue.

A question costs them a context switch, not typing. That is the budget you are spending.

## What a good question looks like

One decision. Their vocabulary, not the codebase's. And the choices in `--option`, not in
the sentence.

> **Bad:** "How would you like me to handle the ambiguity in the checkout total component's
> emphasis requirement?"
>
> **Good:** `--question "Make the total stand out — which way?"`
> `--option "Bigger" --option "Move it above the delivery line"`

**A choice written into the prose is not a choice.** Every `--option` becomes a button in
the panel and the console, and clicking one records the answer; a question that says
"(a) build it, (b) leave existing bookings, (c) hold" makes them re-type in free text what
they should have been able to click, and leaves you parsing prose to find out which one
they meant. If you can enumerate them in the sentence, you can pass them as flags.

Pass them even when there are only two, and even when one is "hold until I check" — that
last one is a real option and it is the one most often left off. The filer can always
choose "say something else", so the list constrains nothing.

Batch per group. Three questions about one checkout flow go out together; three separate
asks about the same screen is three interruptions for one context switch.

Then **park it**. `ask` flips the item to `needs_answer` and you move to the next item. Do
not sit waiting — pick answers up on your next `show`, and bound your polling so an
unanswered item does not spin forever.

## When to show instead of ask

If the answer is visual and you can build it, build all of them and attach images:

```bash
pikku fabric changes shot --change-id <id> --label "Bigger" --kind option --image a.png
pikku fabric changes shot --change-id <id> --label "Above the line" --kind option --image b.png
```

The panel turns a set of `option` attachments into a pick-one they open full-screen, and
picking one writes the choice into the thread. Capture every variant in **one pass at one
width**, including the baseline — variants shot at different sizes are not comparable, and
comparing is the whole point.

`--kind evidence` is the other use: a picture that proves something, rendered inline rather
than as a choice.

## Committing

One item, one commit. `done` records a single `head_commit`, and that sha is what a human
reverts when they change their mind — so an item folded in with three others cannot be
undone without taking the other three with it. Land unrelated work separately.

The subject carries the short id the way a GitHub issue number does, and the uuid goes in a
trailer so `git log --grep` has an exact handle:

```
feat(login): #4 make the sign-in heading brown

Change-Id: 0f3c8a12-9b44-4d2e-8f01-27c6a1d9e5b3
```

Both ids come from `show`. The type and scope are the usual conventional-commit ones —
`feat`, `fix`, `style`, `refactor` — with the scope naming the screen or area they were
looking at, not the file you edited.

More:

```
fix(booking): #7 stop the date picker closing on the first click
style(nav): #12 tighten the spacing around the logo
```

Reverting one later is then:

```bash
git revert $(git log --grep="Change-Id: <uuid>" --format=%H -1)
```

## Finishing

`done` records the branch and commit that closed it, which is what strikes the item through
on the page it was filed on and tells them where the fix landed. Both default to the
checkout you are standing in, so run it from there and let it read git:

```bash
pikku fabric changes done --change-id <id> \
  --note "What you did, for whoever reads the thread later"
```

`--branch` and `--head-commit` override them, for the case where the fix landed somewhere
other than where you are. Never type a sha by hand — one that does not exist points the
filer at nothing.

An item you decided not to do is not `done`. Say why in the thread and leave it for a human
to dismiss.

## Scope

Writes need the `changes:project:write` scope on your bearer. `list` and `show` are reads.
The project comes from the local `pikkufabric.config.json`, so run these from the checkout.
