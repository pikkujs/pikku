---
'@pikku/cli': patch
---

A generated block now carries the recording its run kept, and `--artifact-base` says where the figures are served from.

The runner has kept a video per scenario since video retention landed, and the guide model threw it away: `GuideScenario` held screenshots and nothing else, so a suite that recorded every flow it ran published pages with an empty block under them. A recording leads the stills it is made of, because it shows the whole flow the stills are moments of, and it is deduplicated by artifact id like everything else a data-driven scenario files once per row. `figureless` counts it, so a feature evidenced only by a recording no longer reports that its block renders empty.

It is emitted as an ordinary `![caption](…webm)`. This module writes markdown — no HTML, no asset URLs, no website — and what makes a `.webm` a player rather than a broken image is the consumer's renderer, the same way the consumer resolves the base. Keeping it a figure is what lets a guide stay one artifact that a docs site, a README and a print build can each read on their own terms.

`--artifact-base` is the second half. The base was computed per page as the relative path from the page to the run's artifact root, which is right when the artifacts sit beside the markdown and wrong for every host that serves them from somewhere else. A route-relative prefix (`/docs/_media/`) keeps one compiled tree portable across hosts and, where a host gates access, keeps the figures behind the same gate as the page that embeds them — an origin baked into the markdown is outside it, and cannot be moved without a rebuild. It stays exactly as given, since only the caller knows whether it is a path, a route or an origin.

`GuideScenario.videos` is optional, so a record written before this and every fixture built on one still describes a scenario.
