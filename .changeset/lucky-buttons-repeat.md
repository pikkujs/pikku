---
'@pikku/core': patch
---

fix(agent): make working-memory array semantics explicit

`deepMergeWorkingMemory` replaced arrays wholesale as a side effect of its
object-recursion guard, so nothing in the code said whether that was the
contract or an accident. The merge now handles arrays in an explicit,
documented branch. Replace is kept over append: the full state is echoed back
every turn, so appending would duplicate every item whenever the model re-emitted
the array.

`buildWorkingMemoryPrompt` now states that contract to the model rather than
leaving "only include changed fields" to be read as permission to send a partial
array. This is defensive: measured against `gpt-4.1-mini` the wording changes
nothing, because that model already re-emits the whole list. It is there for
models that do not.
