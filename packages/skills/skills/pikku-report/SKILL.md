---
name: pikku-report
description: >-
  Use when pikku itself cost you time — wrong generated types, a check that passes when it
  should not, output that is quietly wrong, a skill that misled you — or when the user asks you
  to report a framework bug or send the build report. Owns `BUILD-REPORT.md` (what goes in it,
  and when), the workaround-first ladder, and `pikku fabric report`, which sends the file to the
  Pikku team once the user agrees. TRIGGER when: the framework fought you, codegen produced
  something broken, a skill told you to run something that does not exist, the user says "report
  this to pikku", or you are handing over a build whose BUILD-REPORT.md has entries. DO NOT
  TRIGGER when: the bug is in the app you are building (fix it there), or you are tempted to
  patch pikku's source (never do that from an app).
installGroups: [core]
---

# Report what pikku got wrong

A report is about **pikku**, not about the app you are building. It is how the
framework learns what cost its users time — the bug, the misleading skill, the
silence where a check should have complained.

## Write it down the moment it happens

Keep `BUILD-REPORT.md` at the repo root and add an entry as soon as something
fights you. Not at the end from memory: a run that falls over never reaches its
end, and you lose the command and the error.

The ladder decides how much to spend:

1. **Find the quicker workaround.** The user is paying for their feature, not
   for pikku's health.
2. **Investigate** only when there is no workaround, or when the user asks why
   something is slow or wrong.
3. **Write it up at the depth you already reached.** Never spend extra effort to
   report; never throw away effort you already spent. If the investigation took
   you to the mechanism, say so — named file, named function, what is actually
   happening, and what pikku should do instead.

## What counts

Anything that cost you time and would cost the next person the same. Most of
these never produce an error: output that is quietly wrong, a generated type
that disagrees with the runtime, a check that passes when it should not, a
narrowing you had to write by hand because the framework should have written
it. **Having to write code the framework should have written for you counts.**

So does a skill that misled you — a command that does not exist, a flag spelled
differently, a passage the CLI contradicted. Name the skill and quote the
passage: those are fixable immediately, so write them up even when the cost was
small.

Not worth an entry: a preference, a thing you would have designed differently,
or baseline noise that was already failing before you started.

## One entry each

```markdown
## <one-line title>

- **Kind:** product (pikku behaved wrongly) or harness (a skill misled you)
- **Skill:** <name> — "<the passage>" (harness only)
- **Ran:** <the command>
- **Expected:** <what you expected pikku to do>
- **Happened:** <what it did instead; the error's message line verbatim>
- **Workaround:** <what you did instead, inside the app — or "none found", and what you tried>
- **Where:** local, deployed or both
```

Leave out the user's product, code, data, secrets and tokens: the file is about
pikku, and it leaves their machine if they agree to send it. Versions, platform
and package manager are added when it is sent, so do not write them in.

## Sending it

At the very end — after the app is running, and deployed if they chose to
deploy — run:

```bash
pikku fabric report
```

It sends `BUILD-REPORT.md` (or the file you name) as one anonymous document: no
project, no account, no sign-in. What happens depends on what the user said
before, which the CLI keeps on their machine:

- **Always** — it sends, and prints what went. Tell the user in one line.
- **Never** — it does nothing. Do not ask and do not mention it.
- **Nothing saved** — it prints what would be sent and sends nothing. Show the
  user a short summary of the entries and ask once: _"Send these to the Pikku
  team so they can fix them?"_ — **Yes**, **No**, **Always** or **Never**. Then
  run it again with their answer:

  ```bash
  pikku fabric report --consent yes|no|always|never
  ```

  Yes and No apply to this report only; Always and Never are saved and the
  question is not asked again. If nobody answers, send nothing, and say the file
  is there and how to send it later.

An empty report is not sent and not asked about. A send that fails prints why;
carry on with the hand-over, and do not retry or send it twice.

## Never fix pikku itself

Not a patch in `node_modules`, not a linked checkout, not a branch in the
framework repo. Many agents each patching pikku to unblock themselves is many
divergent copies and a merge problem nobody signed up for. Work around it in the
app, write it up, and let the fix happen once.

## What NOT to do

- **Do not report a bug in the app as a pikku one.** If the app's own code is
  wrong, fix it; a report that turns out to be the caller's mistake costs the
  maintainers more than it cost you.
- **Do not write entries from memory at the end.** You will have lost the
  mechanism and the command.
- **Do not send without the user's answer**, unless the CLI says they chose
  Always.
- **Do not put a secret, token or customer data in the file.**
