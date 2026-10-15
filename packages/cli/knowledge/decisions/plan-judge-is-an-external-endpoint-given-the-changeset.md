---
type: decision
title: The plan judge is an external HTTP endpoint that receives the changeset and a bearer token
description: Changesets that need a judgement are sent to the URL in PIKKU_PLAN_JUDGE_URL with the token from PIKKU_PLAN_JUDGE_TOKEN, and a failing judge is read as needing a plan
tags: cli, cloud, plans, judge
---

# The plan judge is an external HTTP endpoint that receives the changeset and a bearer token

`packages/cli/src/cloud/lib/plan-judge.ts` asks whether a changeset needs a technical plan.

The question text is at `plan-judge.ts:25-26`. It asks for a plan when a change adds or changes who
may do something, adds a record kind, changes what is stored, or spans several screens or functions.
`httpPlanJudge` POSTs the question and the changeset as context to a URL with a 30 second timeout
(`plan-judge.ts:32-39`). It sends `Authorization: Bearer <token>` when a token is given
(`plan-judge.ts:39`). A non-OK response throws (`plan-judge.ts:50`).

`configuredPlanJudge` takes the URL from `PIKKU_PLAN_JUDGE_URL` and the token from
`PIKKU_PLAN_JUDGE_TOKEN` (`plan-judge.ts:64-69`). `needsPlan` applies fixed rules first: a created or
altered table, or a changeset of six or more changes, always needs a plan (`plan-judge.ts:80-86`).
Anything else goes to the judge, and a judge that throws is read as needing a plan
(`plan-judge.ts:92-98`).

**What this rules out:** treating a failing judge as no plan. The changeset and token are sent to
whichever URL the environment names.
