---
type: decision
title: Nulls are stripped from approved tool arguments before execution
description: LLMs emit null for optional fields where the schema layer expects undefined, so a resumed tool call is cleaned recursively first
tags: ai-agent
---

# Nulls are stripped from approved tool arguments before execution

`resumeAIAgentSync` in
`packages/core/src/wirings/ai-agent/ai-agent-runner.ts` runs `stripNulls` over
the persisted arguments of an approved tool call before invoking the tool.

Models routinely fill every property in a JSON schema, using `null` to mean "not
provided". Pikku's validation layer models an absent optional field as
`undefined`, and a `null` fails the check outright. The value is stored as the
model produced it — the approval prompt should show what the model actually asked
for — so the cleanup happens at execution time, recursively, including inside
arrays and nested objects.

**What this rules out:** normalizing the arguments at approval-capture time
(the approval UI would no longer reflect the model's real request), and a
shallow single-level null strip.
