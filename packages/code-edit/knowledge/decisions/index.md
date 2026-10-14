---
type: overview
title: Decisions
description: Rules chosen in code-edit, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [Git push uses the user's own credentials and never prompts](git-push-uses-the-users-own-credentials.md) — The git service pushes with whatever credentials the user already has, and git is told never to open a prompt
- [The workspace file service hides and refuses .env and .dev.vars files](workspace-files-hide-and-refuse-env-and-dev-vars.md) — Secret-looking files are left out of listings, path lists, reads and writes in the workspace file service
<!-- /pikku:knowledge-index -->
