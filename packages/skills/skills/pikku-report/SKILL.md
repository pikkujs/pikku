---
name: pikku-report
description: >-
  Use when pikku itself cost you time — wrong generated types, a check that passes when it
  should not, output that is quietly wrong, a skill that misled you — or when the user asks you
  to report a framework bug or file a finding. Owns `pikku fabric report` (a finding is about
  pikku, not the app), the product-vs-harness kinds, the workaround-first ladder, and asking the
  user at hand-over whether to send what was filed. TRIGGER when: the framework fought you,
  codegen produced something broken, a skill told you to run something that does not exist, the
  user says "report this to pikku" / "file a finding", or you are handing over a build. DO NOT TRIGGER when: the bug is in the app you are building (fix it
  there), or you are tempted to patch pikku's source (never do that from an app).
installGroups: [core]
---

# Report a finding to Fabric

A finding is about **pikku**, not about the app you are building. It is how the
framework learns what cost its users time — the bug, the misleading skill, the
silence where a check should have complained.

File each one the moment it happens. Nothing leaves the machine until the user
says so at hand-over, and nothing is written to the repository. The command is
spelled `pikku fabric report` — there is no top-level report command.

## Report at the moment it happens

Not at the end from memory: a run that falls over never reaches its end, and the
mechanism is already loaded while you are in it. One finding per thing that
fought you.

The ladder decides how much to spend:

1. **Find the quicker workaround.** The user is paying for their feature, not
   for pikku's health.
2. **Investigate** only when there is no workaround, or when the user asks why
   something is slow or wrong.
3. **Report at the depth you already reached.** Never spend extra effort to
   file; never throw away effort you already spent. If the investigation took
   you to the mechanism, the finding says so — named file, named function, what
   is actually happening, and what pikku should do instead.

## What counts

Anything that cost you time and would cost the next person the same. Most of
these never produce an error: output that is quietly wrong, a generated type
that disagrees with the runtime, a check that passes when it should not, a
narrowing you had to write by hand because the framework should have written
it. **Having to write code the framework should have written for you is a
finding.**

Also anything that only shows up in one place — invisible locally, fatal
deployed, or the reverse. Say which with `--surface local|deployed|both`.

Not a finding: a preference, a thing you would have designed differently, or
baseline noise that was already failing before you started.

## Two kinds

- `--kind product` — pikku behaved wrongly. Fixing it is a change to the
  framework.
- `--kind harness` — a skill misled you: it told you to run something that does
  not exist, described a flag that is spelled differently, or contradicted what
  the CLI actually did. Pass `--skill <name>` and `--passage "<the line or
section>"`. This is the most useful kind to file, because it is fixable
  immediately — so file it even when the cost was small.

## The command

Send it as JSON on stdin. Most of a finding is prose, and prose carries
apostrophes, quotes, backticks and newlines — each one a shell metacharacter
before it is a character in your sentence. A stack trace passed to `--error`
breaks the command at its first newline; a backtick in `--actual` runs whatever
follows it. Quote the heredoc delimiter (`<<'EOF'`, never `<<EOF`) so the shell
leaves the body alone.

```bash
pikku fabric report --stdin <<'EOF'
{
  "title": "<one-line title>",
  "kind": "product",
  "model": "<the model you are>",
  "expected": "<what you expected pikku to do>",
  "actual": "<what it did instead>",
  "command": "<the command you ran>",
  "workaround": "<what you did instead, inside the app>"
}
EOF
```

The same fields exist as flags for a finding short enough to type; `pikku fabric
report --help` lists them. Whichever path you use, the rules below are checked
before anything is sent:

- `kind` is `product` or `harness`, and a `harness` finding names the skill that
  misled you.
- A resolved finding carries the `workaround` you used (or a `proposal`).
- `--unresolved` means **no workaround was found** — it requires `--tried` with
  what you attempted and how each attempt failed, and it forbids `--workaround`.
  It does not mean the workaround was unpleasant.

Add whichever of these you actually have: `error` (the error's message line,
verbatim), `repro` (the shortest way to reach it again), `proposal`, `area`,
`surface`, `cost` (measured if you measured it — "98s vs 20s steady" ranks;
"slow" does not), `deployTarget`.

Versions, platform and package manager are read off the installed tree for you.
Do not pass them and do not ask the user for them.

## At hand-over

Filing holds the finding on the machine, tied to this build by a run id the CLI
makes for the checkout. The terminal says `held until hand-over`; carry on.

The last thing in the hand-over — after the app runs, and is deployed if they
chose to — is:

```bash
pikku fabric report
```

With no finding, it lists what this build filed. What happens next depends on
what the user said before, which the CLI keeps on their machine:

- **Always** — every finding was sent the moment you filed it. Tell the user in
  one line.
- **Never** — nothing was kept. Do not ask and do not mention it.
- **Nothing saved** — show the user the titles and ask once: _"Send these to the
  Pikku team so they can fix them?"_ — **Yes**, **No**, **Always** or
  **Never**. Then run it again with their answer:

  ```bash
  pikku fabric report --consent yes|no|always|never
  ```

  Yes sends and No discards what is held now; Always and Never are saved and the
  question is not asked again. If nobody answers, leave them held and say that
  `pikku fabric report` sends them later.

Findings are anonymous: no account, no project. The receipt printed when you
filed each one is exactly what leaves the machine. A send that fails keeps what
was not sent; do not retry or file it twice.

## Never fix pikku itself

Not a patch in `node_modules`, not a linked checkout, not a branch in the
framework repo. Many agents each patching pikku to unblock themselves is many
divergent copies and a merge problem nobody signed up for. Work around it in the
app, report it, and let the fix happen once.

## What NOT to do

- **Do not report a bug in the app as a pikku finding.** If the app's own code
  is wrong, fix it; a finding that turns out to be the caller's mistake costs
  the maintainers more than it cost you.
- **Do not batch findings at the end of a build.** You will have lost the
  mechanism and the command, and the report wins nothing.
- **Do not file without a workaround or an `--unresolved --tried`.** A finding
  that cannot be acted on is noise.
- **Do not paste a secret, token or customer data into a finding.** The payload
  leaves your machine; keep it to the mechanism.
- **Do not ask the user for versions or platform.** They are collected
  automatically.
