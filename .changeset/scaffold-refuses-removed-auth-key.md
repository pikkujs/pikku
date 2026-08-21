---
'@pikku/cli': patch
---

fix(cli): a scaffold feature refuses the removed `auth` key instead of ignoring it

`scaffold.<feature>` stopped taking `auth` when a scaffold flag became a
statement about whether a surface is generated rather than about who may call
it. The key was removed from the type, but a `pikku.config.json` still carrying
it loaded clean and was silently dropped — a config that reads as if it closed
the console to anonymous callers while configuring nothing at all.

It is now refused at config load, by name, with the reason and the fix. Any
other unrecognised key is refused too, so a typo'd `paths` fails at load rather
than generating a file at the default location. `null` and arrays are refused
with the same message a bare string already got, rather than crashing on a
property read.

These arrive as `PikkuCLIConfigError`, so the message reaches the developer
verbatim rather than as "failed to load config file".
