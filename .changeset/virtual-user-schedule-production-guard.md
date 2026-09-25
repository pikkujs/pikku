---
'@pikku/core': patch
'@pikku/cli': patch
---

Enabling a virtual user schedule whose disposition production refuses is now refused when written (403), rather than saved and then failing on every tick with nobody watching. Disabling one, or editing one that is off, is always allowed.
