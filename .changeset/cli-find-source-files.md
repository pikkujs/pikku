---
'@pikku/cli': patch
---

Source directories are searched relative to themselves rather than through a glob built from their path, so codegen finds the project's files on Windows and under a path holding `[ ] ( ) {`, and `ignoreFiles` applies when the project is outside the working directory.
