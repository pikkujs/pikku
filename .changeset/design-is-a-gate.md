---
'@pikku/skills': patch
---

Make design something the build loop runs, not something it agrees with.

The design guidance was sound and got skipped, for three structural reasons that are now fixed.

`references/app.md` gains a seventh step in the milestone loop: screenshot the screens this milestone touched and look at the images, as a gate alongside the scenario. Milestones closed on green scenarios, and scenarios say nothing about how anything looks, so the one instruction that mattered lived outside the only loop that runs.

`references/design.md` carries a working way to take that screenshot — headless Chrome over CDP, signing in through the dev actor switcher — because an instruction with no mechanism behind it is one that gets skipped. It also says the component kit is a floor and not a ceiling: an app has to grow the component that draws the thing it is actually about, and the furniture eight pages would otherwise copy-paste, or every screen comes out as `Card` + `Stack` + `Text`.

`references/theming.md` gives the colours `brand` has no field for a home — `covered`, `open`, a recessed surface, a hairline — as named custom properties in both colour schemes. Without one, "don't hardcode colours per component" is broken by the agent that just wrote it down, because the value has nowhere else to go.
