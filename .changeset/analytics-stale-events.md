---
'@pikku/cli': patch
---

`pikku all` no longer stops on its own output after an analytics event is removed. The generated analytics schemas read each event off the declaration, so a removed event threw while they loaded, schema conversion failed, and the run ended before it could rewrite them.
