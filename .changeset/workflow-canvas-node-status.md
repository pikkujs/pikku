---
'@pikku/console': patch
---

Report each workflow canvas node's run status as `data-node-status` alongside its step name, and tag run history rows with `data-run-id` / `data-run-status`. The status was previously only expressible as a background colour, so the only way to check that a run painted correctly was to read the computed rgb and classify the channels — which asserts the palette rather than the run. The timeline's step buttons and its follow-live control carry test ids for the same reason.
