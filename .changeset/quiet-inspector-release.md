---
'@pikku/cli': patch
---

Release the previous inspector state's `typesLookup` before re-inspecting. The live `ts.Type`s in that map kept the old `ts.Program` and its exercised type checker reachable across every re-inspection in `pikku all`, so two full programs were alive at once and large projects ran out of heap in CI. The codegen benchmark now measures live heap at the start of each inspector pass and peak heap, and fails when a pass starts a program's worth above the first.
