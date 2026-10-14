---
type: decision
title: A git remote is compared as host and path with credentials dropped
description: normalizeRepoUrl reduces an ssh or https remote to lowercase host and path, so embedded credentials never take part in matching a repo to a project
tags: cli, fabric, git, link
---

# A git remote is compared as host and path with credentials dropped

`normalizeRepoUrl` in `packages/cli/src/fabric/lib/project-link.ts` reduces a remote to one comparable form. Its doc
comment says one form covers ssh or https, with or without credentials, with or without a `.git` suffix
(`project-link.ts:35-39`).

An scp-style remote is split into host and path, and the user part before `@` is not kept
(`project-link.ts:43-48`). A URL-style remote takes `host` and `pathname` from the parsed URL, and the URL `host`
property does not include a username or password (`project-link.ts:50-53`). The path loses slashes and a `.git`
suffix, and the result is `host/path` in lowercase (`project-link.ts:58-60`).

**What this rules out:** matching a repo to a project using a remote that includes a token. The token is not part of
the key.
