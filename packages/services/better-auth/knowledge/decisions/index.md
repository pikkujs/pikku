---
type: overview
title: Decisions
description: Rules chosen in @pikku/better-auth, and what each one rules out
---

# Decisions

<!-- pikku:knowledge-index -->
- [A session middleware stands down where it cannot authenticate](a-session-middleware-stands-down-where-it-cannot-authenticate.md) — Global middleware runs on addon dispatches too, and an addon's scope deliberately withholds the host's auth secret and auth instance — so the absence is the normal case, not a fault
<!-- /pikku:knowledge-index -->
