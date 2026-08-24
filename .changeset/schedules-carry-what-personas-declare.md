---
'@pikku/cli': patch
---

Send what a persona currently declares alongside the schedule row that is actually running it. A cadence is enabled once and then outlives the declaration it was written from: someone edits `personas.ts`, redeploys, and the row keeps running last month's goals and disposition with nothing anywhere to say so. `listVirtualUserSchedules` now resolves each row's persona out of `personaConfigs` and returns its goals and disposition as `declared`, so the difference is readable rather than inferred.

Which fields differ is deliberately not computed here. It is a question about how to render two values, and a codegen step that answered it would fix the answer for every client — including the ones that want to show both sides rather than a flag.
