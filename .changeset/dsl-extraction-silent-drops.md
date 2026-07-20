---
'@pikku/inspector': patch
---

Stop silently dropping DSL workflow constructs during extraction.

Four constructs produced a wrong workflow graph with no diagnostic:

- A property access on the fanout item (`users.map((u) => workflow.do(..., { userId: u.id }))`)
  was dropped from the step's inputs — `extractInputSource` resolved property
  access against the input param and output variables but not loop variables.
- `const [org, user] = await Promise.all([...])` dropped **both** steps, because
  extraction bailed on any non-identifier binding name before reaching the
  `Promise.all` branch. Array destructuring now binds each name to its matching
  child step's output.
- A brace-less `for (const x of xs) await workflow.do(...)` dropped the entire
  loop, since only block bodies were walked.
- Object destructuring of a step result and multi-declarator statements now
  report a diagnostic instead of vanishing.
