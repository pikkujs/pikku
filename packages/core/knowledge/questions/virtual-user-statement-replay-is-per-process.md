---
type: question
title: A virtual user statement can be replayed once per instance
description: The one-time id store is an in-memory map, so on several instances or Worker isolates each accepts a statement once
tags: services
---

# A virtual user statement can be replayed once per instance

`JoseVirtualUserStatementVerifier` remembers accepted `jti` values in a per-process
map. On a single node that makes a statement single-use. On several instances, or
Cloudflare Workers where isolates share nothing, a captured statement can be accepted
once per instance within its few-minute life.

The lifetime ceiling (300 seconds) and the signed audience bound the damage; neither
removes it.

**What would settle it:** a shared store — the Better Auth `verification` table is
already there — behind the verifier, or a decision that the bound is acceptable for
stages. Not built.
