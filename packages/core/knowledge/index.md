---
type: overview
title: Knowledge
description: Why @pikku/core is built the way it is — the reasoning that used to live in comments
---

# Knowledge

Pikku's source says *what* it does. These notes say *why*, for the handful of
choices where the code alone reads as arbitrary or, worse, reads as a mistake.

The rule that produced this directory: **reasoning never lives in code.** A
comment that restates the line below it is deleted. A comment that records a
decision — a constraint, a trade-off, a thing that was tried and failed — moves
here and gets a name, so it can be linked to and argued with.

Everything mechanical is generated or inspectable: the wirings, the schemas, the
meta files, the export surface. A note that repeats them is a copy that will
drift.

<!-- pikku:knowledge-index -->
- [decisions](decisions/index.md) — a rule that was chosen, and what it rules out
- [questions](questions/index.md) — something asked and not yet answered
<!-- /pikku:knowledge-index -->
