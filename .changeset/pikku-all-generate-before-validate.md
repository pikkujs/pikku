---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Stop `pikku all` failing on a diagnostic its own codegen went on to fix.

The run inspects several times, because generating the scaffold, the leaf indexes and the type files each changes the source graph the next inspection reads. Every full inspection re-runs every validator, so the newest pass is the complete one — but the logger accumulated diagnostics across all of them, and the build gate failed the run if any pass had ever recorded a critical.

A project whose system roles grant a scaffold-declared scope (`virtualUser:*`) therefore could not build from clean: the pass taken before the scaffold existed raised PKU124, the pass taken after was clean, and the run failed anyway. Same for PKU951 on a scaffold-declared secret.

Validation diagnostics are now scoped to the pass that recorded them, so a later pass supersedes an earlier one. Diagnostics reported outside a validation pass — by a generator or a command — are untouched, and a fault every pass reports still fails the run.
