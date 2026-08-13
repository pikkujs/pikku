---
'@pikku/cli': patch
---

Give a CLI channel command the real singleton services

The generated `cliRaw` is itself a pikku function, so its body receives
`secrets` as a throwing accessor — and it passed that same object down as the
**singleton** services for every command run on the channel. A command's
middleware is entitled to `secrets`, but inherited the strip from one level up
and failed with `'secrets' is not available inside a pikku function`.

It now reads the singletons through `getSingletonServices()`. Each command is
still stripped by its own runner, so nothing gains access it would not have
over HTTP.
