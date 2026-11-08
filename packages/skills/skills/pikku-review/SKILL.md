---
name: pikku-review
description: >-
  Adversarial review of Pikku code against the gold standard: every function, workflow, agent and
  generated route in scope read in full and given a gold, fix or bug verdict with evidence. TRIGGER
  when: asked to review, audit, critique or scrutinize a Pikku diff, function, wiring, workflow or
  app, to say whether code is gold standard, or to check code before it merges or ships. DO NOT
  TRIGGER for: writing or fixing the code (review only reports), a non-technical second opinion (use
  pikku-software-archaeology), or reporting a bug in Pikku itself (use pikku-report).
installGroups: [core]
---

# Review

Assume the code is wrong until you have failed to break it. For each function, ask: **would you hold this up as the model example of how to write this in Pikku?**

An app can pass `pikku all`, the type check, lint and its tests and still hold real bugs. Those tools cannot see who should be allowed to do what, or what happens the second time.

You report; you do not fix. If you need to run something, use a copy.

If you wrote this code in this context, stop and hand it to a separate agent with the code but not your conclusions, because you would read your intent rather than the code.

## Method

1. **Scope.** A diff or a whole app. For a diff, also read what the change touches: its callers, the generated routes and the permissions it relies on. Most diff bugs live outside the diff.
2. **Floor.** Run `pikku all`, the type check, lint, format, `pikku validate` and the tests. Read the output, not the exit code. Failures are findings, a check the project lacks is a finding, and passing earns nothing.
3. **Inventory.** List what is in scope with `pikku meta context --json`, because file names mislead. Mark generated scaffold and addon code. Helper, config and middleware files that define no function get a row too, because bugs hide there with nothing to flag them. This list is what you must cover: rows in the report must add up to it, and a grouped row names every function it covers. Check its counts against the source: an empty capability there does not prove the feature is absent.
4. **Keep a working file.** Add a line per function to a notes file beside your copy as each verdict lands, with what you attacked. Long reviews lose context, and the file is what you resume from. A verdict you cannot find there, you have not made. After any reset, reread the file and redo every function it does not cover. If you cannot, mark those `not reviewed`, never gold.
5. **Read every one in full.** Follow helpers, permissions and middleware to their source. For each query, read its schema too: column comments, constraints and what the column means now versus at the time of the event.
6. **Attack it,** using the references below. Keep going after the first bug in a function, since the next one is often worse. Gold is the verdict that needs the most evidence: it means you tried the attacks and they failed, so name them in your notes.
7. **Attack the tests.** What would have to break for each one to fail? Does it reach its state by a path a real user can take? Name tests that cannot fail, and functions with no meaningful test.
8. **Prove what you can.** See [proving](references/proving.md). Mark each finding `run` or `read`.
9. **Try to disprove every bug.** See [verifying](references/verifying.md). Only what survives is reported as a bug.

## What to attack

Read the files the code in scope calls for. A gold verdict needs the first row every time.

| The code | Read |
|---|---|
| Always | [access](references/access.md), [input](references/input.md), [idiom](references/idiom.md), [writing](references/writing.md) |
| Writes data | [concurrency](references/concurrency.md), [partial failure](references/partial-failure.md), [data integrity](references/data-integrity.md) |
| Workflows, schedulers | [workflows](references/workflows.md) |
| Payments, webhooks, external services | [providers](references/providers.md) |
| Money, dates, amounts | [money and time](references/money-and-time.md) |
| Anything billed per use, such as model calls | [metered work](references/metered-work.md) |
| Lists, reports, loops, anything sized by input | [scale](references/scale.md) |
| Channels, subscriptions | [realtime](references/realtime.md) |
| Agents, addons | [agents and addons](references/agents-and-addons.md) |

## Verdicts

- **gold:** you would use it as the example, as written. It needs no reason, and do not invent a complaint to look thorough.
- **strict:** one thing a tool should catch or a matter of taste, such as a loose output schema. Count these apart, because they say little about the code.
- **fix:** it works, but it has a named weakness someone would copy. "This could use a test" belongs in test gaps, not here.
- **bug:** a concrete input or sequence gives a wrong result. If you cannot state one, it is `fix` or nothing.

When a weakness loses money, leaks data, ignores a user's choice or lets someone act as another user, and you can state the scenario, it is a `bug`, not a `fix`. Leave it to the disprove step to knock it down.

Wrong means wrong against what the code was meant to do. Before calling a bug, look for the intent in the schema, comments, seeds, scenarios and sibling functions. A refusal that was designed, such as a duplicate rejected by a constraint, is not a bug, even if its error is ugly. That would be `fix` at most.

A comment is a claim, not evidence. Check it against the code or a run before repeating it, in either direction.

## Every finding needs

- `file:line`
- The scenario: inputs and state, then the wrong result
- `run` (you executed it, and how) or `read` (you only traced it)
- Whether a fix changes behaviour, and what would prove it still works

A short honest list beats padding. Say what you could not run and what your run bypassed.

A defect in Pikku rather than the app goes through `pikku-report`. If your review is report-only, list it under its own heading in the report and say what the app should do until it is fixed.

## Report

Write `REVIEW.md` to the path you were given, otherwise beside your copy. Leave the reviewed repo clean. Include:

1. The answer, first and plain: for a diff, **merge** or **do not merge**; for an app, **gold** or **not gold**. Only a bug the diff causes or makes worse, or a floor check it fails, blocks a merge. So a clean diff with a few `fix` notes is still **merge**, and a bug that was already there goes under its own heading. Then totals: gold, strict, fix and bug, out of how many
2. Floor checks
3. A verdict per function, with a reason for anything but gold
4. Bugs, worst first, then any bug that predates a diff. Anything that loses money, leaks data or lets someone act as another user is a bug here, even if you first wrote it as a table row
5. Test gaps
6. What you could not run
7. Rule candidates: findings a script or `pikku all` could catch

## Growing this skill

Each reference is a short list of questions, and a question stays only if it earns its place.

- A new kind of bug becomes a question in the right file.
- A finding that keeps repeating becomes a rule candidate.
- A rule that lands in the CLI leaves the file, so review spends its time on what tools cannot see.
- A real bug that a review missed goes in [calibration](references/calibration.md), which is how a reviewer gets tested before you trust its gold verdicts.
