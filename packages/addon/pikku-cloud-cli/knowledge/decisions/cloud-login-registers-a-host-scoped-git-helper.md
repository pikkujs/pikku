---
type: decision
title: pikku cloud login registers a git credential helper for the cloud git host only
description: Login adds one credential helper line scoped to the cloud git host, so git push there authenticates with the login; logout removes that line and nothing else
tags: cli, cloud, auth, login, git
---

# pikku cloud login registers a git credential helper for the cloud git host only

After a login saves its token, `CloudLogin` runs `registerGitHelper` for the cloud
git host (`src/lib/git-credential.ts`). The host is `PIKKUSTUDIO_GIT_HOST`, or the
api host with `api.` swapped for `git.` (api.pikkustudio.app → git.pikkustudio.app).
It writes two lines to the global git config, both scoped to that host:

- `credential.https://<host>.helper = !pikku cloud auth git`, added once, so running
  login again changes nothing;
- `credential.https://<host>.useHttpPath = true`, because the cloud needs the repo
  path to know which project's credential to mint.

`pikku cloud auth git` is hidden from `--help`; git runs it, people do not. It
answers only `get`, only over https, and only for that host, by calling
`getGitCredential` with the stored login. The cloud resolves the path to a project
the caller can access and returns that person's own git token. Any other request,
and any failure, gets an empty answer, so git asks its next helper.

`pikku cloud logout` forgets the token and removes exactly the helper line login
added; a helper the person set for that host themselves stays.

**What this rules out:** a global `credential.helper` override, a hand-minted token
for pushing to a cloud repo, and a shared clone token handed to a developer machine.
