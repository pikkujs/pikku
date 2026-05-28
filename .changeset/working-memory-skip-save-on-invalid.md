---
"@pikku/core": patch
---

Working memory is no longer persisted when the merged value fails schema
validation. Previously the working-memory middleware logged a warning but
still called `saveWorkingMemory`, which could poison subsequent
`getWorkingMemory` reads with data that violates the declared schema. It now
warns and skips the write, leaving the last valid value in place. The
extracted (tag-stripped) response text is still returned on the failure path.
