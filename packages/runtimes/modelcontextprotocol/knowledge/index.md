---
type: overview
title: Knowledge
description: Why @pikku/mcp-server answers the way it does when it is behind a proxy or fully gated
---

# Knowledge

Two things about this runtime are decided by what a *client* does with the
answer, not by what the answer says locally: the origin advertised in the
protected-resource metadata, and whether the handshake is challenged at all.

Both read as over-caution until you watch a client conclude the wrong thing and
silently offer the user nothing.

<!-- pikku:knowledge-index -->
- [decisions](decisions/index.md) — a rule that was chosen, and what it rules out
<!-- /pikku:knowledge-index -->
