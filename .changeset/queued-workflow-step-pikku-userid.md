---
'@pikku/core': patch
---

fix(workflow): carry `pikkuUserId` onto queued workflow step wires so authed steps rehydrate their session

A workflow step invoked on the queued (pg-boss) executor received the bare job wire (payload is just `{ runId }`), so `pikkuUserId` was never on the step wire and an authed step (`pikkuFunc`) threw `Authentication required` — even though the run wire persisted the acting user's id and the inline executor worked. `invokeStepRpc` now reads `pikkuUserId` from the persisted run wire and merges it into the step wire override, so authed steps rehydrate their session via the `SessionStore` on both the inline and queued paths.
