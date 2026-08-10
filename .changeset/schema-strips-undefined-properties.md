---
'@pikku/core': patch
---

**An explicitly-`undefined` property no longer kills a step.** JSON Schema
cannot describe such a property, so the validator rejected the whole instance
rather than the field — `{ a: undefined }` threw
`Instances of "undefined" type are not supported`. Whether a payload could
contain one depended on how the call travelled: `JSON.stringify` drops those
keys over HTTP, while an in-process dispatch hands the object over intact, so
`workflow.do('step', 'rpc', { retries: data.maybeRetries })` failed only when
the step ran inline. `validateSchema` now strips them first, and an
explicitly-undefined *required* field reports as the missing property it is.
