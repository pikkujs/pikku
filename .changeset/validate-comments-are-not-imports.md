---
'@pikku/cli': patch
---

`fabric validate` no longer reads comment prose as an import

The undeclared-dependency check matched `from "…"` in raw file text, so any
sentence putting a quoted phrase after the word *from* became a phantom
dependency — at error severity, against the app, with nothing naming the file
it came from:

```
✗  @project/app imports undeclared package(s): is fine — the deploy bundle cannot resolve them
```

The source is now scanned with comments blanked (a new `blankComments` keeps
the text the same length so offsets still line up), and the fix hint names the
file and line each missing package was first imported at.
