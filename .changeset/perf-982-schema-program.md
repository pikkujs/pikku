---
'@pikku/inspector': patch
---

Cut the schema generator's ts.Program cost — the dominant contributor to `pikku all` memory and time.

Two independent fixes: the program is now scoped to the virtual file's import
closure (870 source files instead of the whole tsconfig's 2572), and it is
released once schemas are generated instead of being pinned at module scope for
the life of the process. On a 279-function tree this cuts cold codegen ~20% and
in-pass live heap ~21%, with byte-identical schema output.
