---
'@pikku/cli': patch
---

perf(cli): only resolve symlinks when scanning for external dependencies

The split-type-identity check called `realpath` on every installed package.
`realpath` lstats every component of the path it is given, so the scan scaled
with the install layout rather than with anything interesting: 143ms on a
hoisted tree (1781 packages at the root) against 7ms on an isolated one (35).

A path that traverses no symlink cannot leave the project, and `readdir` already
hands back the entry type, so ruling a package out costs nothing. Now 45ms
hoisted and 3.5ms isolated — cheap enough to consider running before codegen
rather than only in `validate`, which matters because the failure it detects
kills the process rather than failing it.

The two-hop case is what makes this fiddly, and it is the common one: bun links
`node_modules/@scope/pkg` into an in-project store and the link out of the tree
is the `dist` inside that target, so the first hop lands inside the project and
proves nothing.
