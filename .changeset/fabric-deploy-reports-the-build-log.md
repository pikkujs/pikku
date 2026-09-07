---
'@pikku/cli': patch
'@pikku/skills': patch
---

Report the builder's own log when a fabric deploy fails. A failed deployment has
an empty manifest and plan, `statusReason` is null for anything that is not a
gate, and `fabric logs` serves the running stage rather than the build — so the
CLI said `failed in 248s` and nothing else, which reads as "your project is
broken" even when the build host was simply unreachable.
