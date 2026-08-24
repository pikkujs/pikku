---
'@pikku/console': patch
---

Render a scenario opened on the workflow surface as its scenario document, and drop the persona timeline.

A scenario reached through a workflow panel or the workflow canvas was drawn as a second, timeline-shaped view of its graph: actor cards down a rail, under a workflow header repeating the name with `No summary` beneath it. It said less about the scenario than the scenario's own declaration does, and it was a separate rendering to keep in step with the scenarios page.

Both surfaces now mount the same `ScenarioSection` the feature document uses — the given/when/then ladder in the author's sentences, the cast, and the `Examples:` table — with steps still opening the step details panel. `PersonaTimeline` and its timeline model are removed, and `ScenarioDocument` is exported for hosts that want one scenario on its own.
