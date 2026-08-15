---
type: decision
title: The actor's instructions say the word "json" because a degraded gateway demands it
description: A gateway that cannot take a JSON schema falls back to OpenAI's json_object mode, which refuses any request whose prompt does not contain the word
tags: core, actor-flow
---

# The actor's instructions say the word "json"

Every call the actor makes wants a schema'd object back. A gateway that cannot
accept a JSON _schema_ degrades to OpenAI's `json_object` response mode, and
that mode refuses the request outright — a hard API error, not a bad answer —
unless the literal word "json" appears somewhere in the prompt.

The word is therefore in the shared instruction block, once. All three call
sites (turn, approvals, verdict) build on that block, so one mention covers
them, and it costs nothing on providers that never needed telling.

**What this rules out:** tidying the instructions by removing a word that reads
as redundant. It is load-bearing for exactly one provider configuration, and its
absence fails the request rather than degrading the output — so the failure will
not look like a prompt problem.
