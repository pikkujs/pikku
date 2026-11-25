---
'@pikku/cli': patch
---

A process group the changes tools started (a gate's tool, a builder's Pi) gets SIGTERM and up to two seconds before SIGKILL when the process that started it exits or is stopped by SIGTERM or SIGINT, so a leader that started process groups of its own, as Pi's tool calls are, stops them instead of leaving them running.
