---
type: overview
title: Knowledge
description: Why @pikku/better-auth's session middleware sometimes does nothing at all
---

# Knowledge

Session middleware is registered globally, which means it runs on every
dispatch in the application — including ones it was never meant to
authenticate, and ones whose scope withholds the very thing it needs.

These notes record when doing nothing is the right answer, so the guards that
produce it are not read as missing error handling.

<!-- pikku:knowledge-index -->
- [decisions](decisions/index.md) — a rule that was chosen, and what it rules out
<!-- /pikku:knowledge-index -->
