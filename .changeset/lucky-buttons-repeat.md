---
'@pikku/core': patch
---

fix(agent): make working-memory array semantics explicit

`deepMergeWorkingMemory` replaced arrays wholesale as a side effect of its
object-recursion guard, while `buildWorkingMemoryPrompt` told the model to
"only include changed fields" — so a model that emitted just the new array item
silently lost the rest. The merge now handles arrays in an explicit, documented
branch, and the prompt states that arrays are replaced and must be re-emitted in
full. Replace is kept over append: the full state is echoed back every turn, so
appending would duplicate every item whenever the model re-emitted the array.
