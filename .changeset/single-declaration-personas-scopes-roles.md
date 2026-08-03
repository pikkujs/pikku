---
'@pikku/inspector': patch
'@pikku/core': patch
---

Make `defineScope`, `defineSystemRole` and `definePersonas` single-declaration constructs
— exactly one call site per codebase, the rule `pikkuBetterAuth` has always had.

Each of the three already takes a keyed object, so one call declares as many entries as
you like. Spreading the calls across files bought nothing and cost the thing that matters:
there was no answer to "where do I add a persona?", so downstream tooling and agents had
nowhere unambiguous to read from or append to. The only duplicate handling that existed
caught a narrow case — the same id declared twice with different content — and said
nothing about the same id declared twice in two files.

A second call now fails the build with `PKU583` (`defineScope`), `PKU584`
(`defineSystemRole`) or `PKU585` (`definePersonas`), naming both source files and saying
to declare them all in one call. A second call in the _same_ file is refused too: "the
file" is not an answer either when the file holds two calls.
