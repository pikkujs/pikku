---
type: decision
title: Only a Symbol-branded framework result can request tool approval
description: Approval markers are trusted from the APPROVAL_REQUIRED Symbol on a forwardsApproval tool, never from a JSON key an LLM could emit
tags: agent
---

# Only a Symbol-branded framework result can request tool approval

`checkForApprovals` in
`packages/core/src/wirings/agent/agent-stream.ts` honours a forwarded
approval only when both hold: the tool declares `forwardsApproval` (set solely by
framework code on the sub-agent delegating tools built in
`agent-prepare.ts`), and its result carries the `APPROVAL_REQUIRED` unique
Symbol. The companion `__approvalRequired` string key exists for transport, but
is never what the decision reads.

A tool result is attacker-influenceable — a retrieved document, a third-party API
response, or a sub-agent's LLM-shaped `result.object`. All of those are plain
JSON, and plain JSON cannot carry a Symbol. Trusting the string key would let any
ordinary tool conjure a suspension and an approval prompt showing a tool name and
arguments of its choosing.

**What this rules out:** checking `'__approvalRequired' in result` as the
condition; replacing the Symbol with a string or numeric sentinel so results
survive JSON serialization; and setting `forwardsApproval` from user-supplied
tool configuration rather than from framework code.
