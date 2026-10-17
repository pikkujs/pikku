---
'@pikku/inspector-go': patch
---

Port the shared finalize pass (post-processing, HTTP route auth, and the exposed-gate, tag-middleware and single-step-workflow validators) to Go behind `pikku-inspect inspect --stdin --finalize`; the protocol carries the validation-pass bracket, which the wrapper replays.
