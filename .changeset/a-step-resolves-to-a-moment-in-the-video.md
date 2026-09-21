---
'@pikku/core': patch
'@pikku/playwright': patch
'@pikku/cli': patch
---

A scenario step row now carries where it fell inside each actor's recording, and a scenario result now says which feature it came from by id as well as by title.

The video offset is recorded rather than estimated. Documentation built out of a run has to turn a step sentence into an exact moment — a chapter marker, or a still pulled with `ffmpeg -ss` — and the only number available until now was the scenario clock summed out of the ladder. That clock is not the video's: recording starts when the actor's browser context opens, which is somewhere after step one, and every RPC step before or between the browser ones burns scenario time while the file sits still. The two drift apart by however much of the scenario happened off camera, and a still forty seconds out is a picture of the wrong screen with nothing to say it is wrong.

So `ScenarioStepRow.video` is stamped at the moment the step runs, from the driver's own clock: `ScenarioBrowserProvider.videoStartedAt(actor)` reports when that actor's context was opened with `recordVideo`, and the runner subtracts. It is a list of `{ actor, offsetMs }` rather than one number, because a video belongs to an actor and not to the scenario — one step touching two windows falls at a different moment in each, and an offset that does not name its file cannot be seeked to. A run without video, a step with no actor, and a step that never ran all carry nothing, which is what keeps the console's existing estimate as the fallback for runs recorded before this.

`ScenarioResult.featureId` is the other half of the same problem. `feature` is a title written for people to read and rewritten whenever the wording improves, so nothing downstream could key off it; the id `addFeature` registered the feature under does not move. The runner threads it from the plan, which read it off the registry, instead of deriving it from the label. `scenarioName` already carried the registration id and keeps it.
