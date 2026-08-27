---
'@pikku/cli': patch
---

fabric validate: stop two scanners reporting false positives.

The undeclared-import scan read raw file text, so prose in a comment or a
description string matched its `from "..."` pattern — `Converted from the
Gherkin scenario of the same name` reported a missing package named `signed`.
Comments are now blanked before the scan, and a specifier containing whitespace
is never a package name.

The scenario copy scan matched every string literal in the file against the
message catalogue, so an RPC payload field whose value happens to equal a label
was reported as hardcoded UI copy — `unit: 'kg'` flagged against a `unit_kg`
form suffix, where rewriting it to a message lookup would bind a stored value to
UI copy. A literal in `key: '...'` position now only counts when the key names
something the browser renders; bare locator arguments are unchanged.
