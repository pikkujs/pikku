---
'@pikku/core': patch
'@pikku/node-http-server': patch
---

Local content uploads stream to disk instead of being buffered in memory, and a rejected or aborted upload leaves no file behind. A 300 MB upload and read no longer grows the server's memory with the file.
