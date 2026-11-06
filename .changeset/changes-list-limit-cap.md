---
'@pikku/addon-changes-cli': patch
---

`pikku changes list` (and `next` and the knowledge-gaps scan) no longer ask the server for more changes than it allows in one page. They requested up to 5000 against a server cap of 200 and failed with a 422 `limit 5000 > 200`; they now request 200.
