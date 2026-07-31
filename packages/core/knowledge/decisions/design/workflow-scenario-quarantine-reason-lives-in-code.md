---
type: decision
title: A quarantined scenario states its reason in code, not in a CI invocation
description: `skip` carries the why next to the scenario it applies to, and naming the scenario explicitly still runs it
tags: workflow
---

# A quarantined scenario states its reason in code, not in a CI invocation

`WorkflowsMeta`'s `skip` field (`workflow.types.ts`) is a string, not a boolean.
A scenario held out of a default run has to say why, and stating the reason in
code keeps the quarantine next to the scenario it applies to rather than buried
in a CI invocation nobody reads. A skipped scenario is still runnable — naming
it explicitly with `--flows` runs it regardless — so quarantine is a default,
not a disablement.

**What this rules out:** turning `skip` into a boolean flag, moving the skip
list into CI configuration, or making a skipped scenario unrunnable.
