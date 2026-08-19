---
'@pikku/cli': patch
---

refactor(cli)!: `clientFiles.startServerFnsFile` is now `clientFiles.tanstackStartFile`

The old name read as "start the server fns" when it meant "the TanStack **Start**
server-fns file". A config still using it now fails to load with the new name in
the message, rather than silently generating nothing.
