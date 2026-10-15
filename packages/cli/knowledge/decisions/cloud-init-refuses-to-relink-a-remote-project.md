---
type: decision
title: pikku cloud init refuses to re-link a remote-linked project and replaces a local link only with force
description: pikku cloud init throws when a remote-linked project already exists, and when a local link exists it throws unless force is passed
tags: cli, cloud, init, link
---

# pikku cloud init refuses to re-link a remote-linked project and replaces a local link only with force

`CloudInit` in `packages/cli/src/cloud/functions/init.function.ts` requires a token (`init.function.ts:37-41`).

The check at `init.function.ts:43-52` throws when a project is already linked and either the link is `remote`
or `force` is not set. The message says to pass `--force` only for a local link. The comment says a remote link
cannot be forced past, since a second project on the same repo is the ambiguity later commands refuse to guess
through (`init.function.ts:43-44`).

**What this rules out:** replacing a remote link with `init`, and replacing a local link without `--force`.
