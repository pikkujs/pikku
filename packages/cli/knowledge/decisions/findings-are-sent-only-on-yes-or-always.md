---
type: decision
title: Findings are held locally and sent only after an explicit yes or always
description: The cloud report function holds each finding, sends only when the answer is yes or always, and asks the user on a terminal or prints a request when there is none
tags: cli, cloud, report, consent
---

# Findings are held locally and sent only after an explicit yes or always

`packages/cli/src/cloud/functions/report.function.ts` decides what happens to a finding.

A saved `never` stops the run when no `--consent` answer is given (`report.function.ts:108-112`).
An answer passed with `--consent` is saved when it is `always` or `never` and differs from the
saved value (`report.function.ts:113-115`). A `--consent` answer of `yes` still proceeds past a
saved `never`, since the early return needs no answer.

When a finding is filed it is held (`report.function.ts:124-142`). A decision of `no` or `never`
drops the held findings (`report.function.ts:147-155`). A decision of `yes`, or a saved `always`,
sends them (`report.function.ts:156-158`). Otherwise, on a terminal, the function asks
(`report.function.ts:175-184`). Without a terminal it prints a request to ask the user and
returns `needsConsent: true` (`report.function.ts:185-188`).

**What this rules out:** sending findings on silence, or on a run with no terminal to answer.
