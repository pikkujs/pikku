---
'@pikku/cli': patch
---

`pikku all` on a fresh project no longer skips its bootstrap pass. The run record folder it creates at startup made the output directory look already generated, so schema generation imported source files before the `#pikku/*` leaves they depend on existed.
