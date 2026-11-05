---
type: decision
title: Findings are held in the checkout and sent, under the account, only after a yes or always while logged in
description: pikku report writes each finding to .pikku/findings, keeps it there when logged out, and when logged in sends it under the account token only on yes or always, asking on a terminal or printing a request that names the account
tags: cli, report, consent
---

# Findings are held in the checkout and sent, under the account, only after a yes or always while logged in

`packages/addon/pikku-cloud-cli/src/functions/report.function.ts` decides what happens to a finding.

A saved `never` stops the run when no `--consent` answer is given, before anything is written. An
answer passed with `--consent` is saved when it is `always` or `never` and differs from the saved
value. A `--consent` answer of `yes` still proceeds past a saved `never`.

Filing writes the finding to `.pikku/findings/` at the checkout root (`held-findings.ts`), or to
`PIKKUSTUDIO_FINDINGS_DIR`. A decision of `no` or `never` drops what is held.

Otherwise the login decides. With no token nothing is sent and nothing is asked: the findings stay
on the computer, with no error, whatever the answer was, and the next `pikku report` that has a
token and a yes or a saved `always` sends them. With a token, `yes` or a saved `always` sends them
over `submitFinding` with `Authorization: Bearer <token>`. With a token and no answer, a terminal
is asked and anything else prints a request and returns `needsConsent: true`. Both name the account
(`accountLabel` in `finding.ts`): the email from `getSession`, or the source of the token and the
API host when cloud does not answer.

Findings are not anonymous. The token tells cloud who sent them, and the question says so.

The test is logged in, not linked. `cloudChangesBackend` needs a linked project because a change
belongs to one, and a finding does not: `submitFinding` takes no project id, and the command runs
outside any project. `SandboxFiling` in `changes-backend.ts` does not apply either: it files a
change into the sandbox's project over `createSandboxChange`, which has no fields for a finding.

Every local failure, whether the findings folder, the consent file or the login, is a warning
returned in `warnings`, and the command exits 0. A finding must not fail a build. Only a malformed
finding is refused.

`pikku dist` leaves `.pikku/findings` out of what it copies, so held findings are not published with
an addon.

**What this rules out:** sending findings on silence, on a run with no terminal to answer, or
without an account; a finding failing a build; findings under `.git`, or under the home directory
by default, which a sandboxed agent cannot write to.
