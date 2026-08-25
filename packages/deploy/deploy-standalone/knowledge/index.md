---
type: overview
title: Knowledge
description: How a standalone unit comes to contain a frontend as well as a server, and how it becomes a double-clickable desktop app
---

# Knowledge

A standalone unit is meant to be one artifact you can hand someone: a binary
that, when run, is the whole application. Adding a UI to that picture forces
three questions — what kind of frontend, who builds it, and where the files
live at runtime — and the answers are less obvious than they look.

Wrapping that binary in a window forces a second set: who starts the server,
how the window learns the port it bound, who holds the passphrase, and what
happens to the server when the window goes away.

These notes record the answers and the constraints that produced them.

<!-- pikku:knowledge-index -->
- [decisions](decisions/index.md) — a rule that was chosen, and what it rules out
<!-- /pikku:knowledge-index -->
