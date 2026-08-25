---
type: overview
title: Knowledge
description: Why encryption in this package is a query-layer concern rather than a call-site one
---

# Knowledge

Encrypting data at rest inside a database that still has to answer SQL queries
is a set of trade-offs, not a feature toggle. What gets encrypted, who does the
encrypting, and which key protects which rows are three separate questions, and
answering them independently is what keeps the result usable.

These notes record how this package answers them.

<!-- pikku:knowledge-index -->
- [decisions](decisions/index.md) — a rule that was chosen, and what it rules out
<!-- /pikku:knowledge-index -->
