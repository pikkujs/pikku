---
'@pikku/addon-console': patch
'@pikku/cli': patch
'@pikku/console': patch
---

feat(console): one scope per console area, under `pikku:console`

The console gated itself on a single `admin` scope declared on `wireAddon`, so
one grant covered reading a secret, rewriting a function body and reading the
audit trail alike — and the secret and variable brokers, which the CLI emits
into the app's own scaffold rather than the addon, were not covered by the addon
gate at all and carried no scope of their own.

Every console function now declares the area it belongs to:

```
pikku:console:secrets      read | write
pikku:console:variables    read | write
pikku:console:addons       read | install
pikku:console:credentials  read | manage
pikku:console:scopes       read | manage   (was pikku:scopes:*)
pikku:console:audit        read            (was pikku:audit:*)
pikku:console:wirings      read
pikku:console:security     read | run
pikku:console:workflows    read | manage
pikku:console:agents       read | manage
pikku:console:db           read
pikku:console:knowledge    read
pikku:console:emails       read | write
pikku:console:code         write
```

`pikku:console` grants the lot, and `pikku` still grants that — the generated
`PIKKU_CONSOLE_TOKEN` session carries `['admin', 'pikku']`, so an external
console keeps working untouched.

**Migration.** `admin` no longer reaches the console: it is a different tree.
Grant `pikku:console` alongside `admin` to keep an administrator's access as it
was, or grant the individual areas to hand out less. The two existing console
scopes moved: `pikku:scopes:read` / `pikku:scopes:manage` are now
`pikku:console:scopes:*`, and `pikku:audit:read` is now
`pikku:console:audit:read`.
