---
type: decision
title: The workspace file service hides and refuses .env and .dev.vars files
description: Secret-looking files are left out of listings, path lists, reads and writes in the workspace file service
tags: [code-edit, secrets, workspace]
---

# The workspace file service hides and refuses .env and .dev.vars files

`isSecret` in `packages/code-edit/src/workspace-files.ts` matches `.env`, any `.env.*`
name and `.dev.vars`, and it excludes names ending in `.example` (lines 34-36).

`hidden()` (lines 54-55) combines that with the ignored-folder set. It is applied when
listing a directory (line 68), when building the path list (line 94), and when reading a
file, where a hidden path or a hidden symlink target gives "no file" (lines 119-123).

`write` refuses a hidden path and throws `WorkspaceFileNotFoundError` (lines 147-151).

**What this rules out:** reading, listing or writing a `.env` or `.dev.vars` file through
this service. The `.example` exclusion lets templates stay visible.
