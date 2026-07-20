---
'@pikku/addon-console': patch
---

Drop dead service-existence guards from the console addon functions.

All 27 `if (!service) throw new MissingServiceError(...)` guards are removed.
A service is optional only when nothing destructures it — in which case it is
never created — so a guard inside a function that *does* destructure it can
never fire. Now that wired functions receive `WiredServices`, these are dead
code and the compiler agrees: the addon typechecks with the guards gone.

Two function descriptions that documented the unreachable `MissingServiceError`
are corrected.
