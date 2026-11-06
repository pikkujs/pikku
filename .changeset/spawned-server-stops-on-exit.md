---
'@pikku/cli': patch
---

`pikku scenario run --spawn` stops its server when a run passes. `SpawnedServer.stop` takes no arguments again, because as an exit listener it was handed the exit code and treated 0 as the signal, which sends nothing. `SpawnedServer.kill(signal)` sends a chosen signal.
