---
'@pikku/cli': patch
---

Generated imports are forward-slashed on Windows. A path like `..\src\update-user.function.js` read `\u` as a unicode escape and failed to compile.
