---
type: question
title: Should a newly scaffolded permission grant access by default?
description: pikku new permission writes a permission whose body returns true with a TODO, so the scaffold grants every caller until someone edits it
tags: cli, scaffold, auth, permissions
---

# Should a newly scaffolded permission grant access by default?

`pikkuNewPermission` in `packages/cli/src/functions/commands/new-permission.ts` writes a
permission file for either type. The `simple` template is the default for any
`type` other than `factory` (`new-permission.ts:41-43`). Its body is a
`// TODO: implement permission check` comment followed by `return true`
(`new-permission.ts:46-49`). The factory template has the same shape
(`new-permission.ts:29-36`).

So a permission generated and wired without edits allows every call it guards.
Nothing in the command refuses to generate it, and nothing marks the file as
unfinished beyond the comment.

The choice is open. Whether the scaffold should deny by default, or refuse to
wire a permission still carrying the placeholder, is not decided in code. The
current behavior is kept until someone decides otherwise.
