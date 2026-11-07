---
'@pikku/cli': patch
---

`pikku db migrate --localOnly` refuses any database whose host is not loopback, including a `host=` or `hostaddr=` override in the connection string.
