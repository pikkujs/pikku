---
type: overview
title: Knowledge
description: Why @pikku/node-http-server resolves requests in the order it does
---

# Knowledge

The server's request pipeline reads as a plain sequence of `if` guards. The
order of those guards is not arbitrary, and one of them was reordered to fix a
bug that only appears when a mount covers the whole tree.

These notes exist so the sequence is not "tidied" back into the shape that
reads more naturally and silently breaks the API.

<!-- pikku:knowledge-index -->
- [decisions](decisions/index.md) — a rule that was chosen, and what it rules out
<!-- /pikku:knowledge-index -->
