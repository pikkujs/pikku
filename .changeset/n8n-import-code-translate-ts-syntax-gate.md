---
'@pikku/n8n-import': patch
---

Code-node translation now falls back to a throwing stub when the original n8n
JavaScript is valid JS but not valid TypeScript syntax (e.g. octal literals like
`00000000`, stray HTML comments). The body is emitted verbatim under
`// @ts-nocheck`, which suppresses type errors but not syntax errors, so such
bodies previously produced a hard `tsc` parse failure. `translateCodeNode` now
parses the body in its emitted function context and bails to the verbatim
JSDoc-preserving stub on any syntactic diagnostic. Closes the last three
genuine codegen defects in the corpus (0683/0808/0945).
