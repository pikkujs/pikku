---
type: overview
title: Knowledge
description: Why the jose JWT service picks its verification key and algorithm as it does
---

# Knowledge

The jose service signs and verifies JWTs with secrets it reads at start-up. These
notes record how a token's header decides which secret checks it.

<!-- pikku:knowledge-index -->
- [decisions](decisions/index.md) — a rule that was chosen, and what it rules out
<!-- /pikku:knowledge-index -->
