---
'@pikku/inspector-go': patch
---

Stop building and shipping the darwin-x64 pikku-inspect binary. Intel Macs are no longer a supported host, and that target was the slowest cross-compile in the release.
