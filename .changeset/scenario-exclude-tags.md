---
'@pikku/cli': patch
---

Add `--exclude-tags` to `pikku scenario run`.

`--tags` is match-any with no negation, so a suite could not express "run
everything except the live-model scenarios" — the shape any project needs once
one cluster of its scenarios requires a real API key or a browser. Tags listed
in `--exclude-tags` disqualify a scenario after every other selector has run,
except when the scenario is named directly with `--flows`, which stays the
explicit override.
