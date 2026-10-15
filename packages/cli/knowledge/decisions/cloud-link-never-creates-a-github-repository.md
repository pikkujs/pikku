---
type: decision
title: pikku cloud link never creates a GitHub repository and asks before creating one on Pikku Studio Cloud
description: With no origin, link refuses --github, and otherwise either requires --gitea or asks the user before creating a repository on Pikku Studio Cloud's git server
tags: cli, cloud, link, consent
---

# pikku cloud link never creates a GitHub repository and asks before creating one on Pikku Studio Cloud

`createRemote` in `packages/cli/src/cloud/functions/link.function.ts` runs when a project has no `origin`. Its comment says
Pikku Studio Cloud creates the repo on its own git server, and that creating a GitHub repo on the user's behalf needs a separate consent
flow (`link.function.ts:215-220`). It also says nothing happens unasked (`link.function.ts:222-223`).

With `github` set it throws and tells the user to create the repo on github.com (`link.function.ts:237-240`). Without `gitea`,
a session with no terminal throws and names `--gitea` (`link.function.ts:243-247`). With a terminal it asks before creating
one (`link.function.ts:249-251`).

**What this rules out:** creating a GitHub repository for the user, and creating a Pikku Studio Cloud repository without asking or
`--gitea`.
