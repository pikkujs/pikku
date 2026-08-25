---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

Render a scenario step's actor without a definite article.

`composeStepProse` prefixed every actor-driven step with `the `, so a report only
read as English when the persona key happened to be a role noun — `the shopper
buys an apple`. A persona named after a person, which is what the fabric template
ships as its placeholder, came out as `the nadia opens /app`. The article was the
reporter imposing a naming convention on keys the author chose, so it is gone:
`shopper buys an apple`, `nadia opens /app`, `lead is on /app`. The phase word,
`{placeholder}` filling and the `#ordinal` lookup for repeated step names are
unchanged, and an actorless step still reads as its description alone.
