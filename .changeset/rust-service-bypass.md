---
'@pikku/inspector-go': patch
---

The Rust inspector reports direct filesystem and `process.env` use (`state.serviceBypass`, PKU412 and PKU413) the way the Go inspector does, so the two agree on every project again
