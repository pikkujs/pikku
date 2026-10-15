---
type: overview
title: Decisions
description: Rules chosen in the pikku changes commands, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [The plan judge is an external HTTP endpoint that receives the changeset and a bearer token](plan-judge-is-an-external-endpoint-given-the-changeset.md) — Changesets that need a judgement are sent to the URL in PIKKU_PLAN_JUDGE_URL with the token from PIKKU_PLAN_JUDGE_TOKEN, and a failing judge is read as needing a plan
<!-- /pikku:knowledge-index -->
