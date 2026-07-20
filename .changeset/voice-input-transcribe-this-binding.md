---
'@pikku/core': patch
---

Fix `voiceInput` middleware losing the runner receiver: it grabbed
`aiAgentRunner.transcribe` as a bare method reference, so calling it left `this`
undefined and threw `Cannot read properties of undefined (reading 'getModel')`
on the first audio attachment. It now calls `aiAgentRunner.transcribe(...)`
directly, preserving the receiver.
