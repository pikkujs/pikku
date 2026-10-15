---
type: decision
title: Adding an app writes the new app onto its virtual users only after the refusal and declaration checks pass
description: The app-new command refuses on the scaffold rules and on undeclared virtual users, and only then records the app on each named virtual user in source
tags: cli, virtual-users, apps, scaffold
---

# Adding an app writes the new app onto its virtual users only after the refusal and declaration checks pass

The `app new` command in `packages/cli/src/functions/commands/app-new.ts` runs its checks in order before
it touches the file that defines virtual users.

It first calls `refuseNewApp` with the slug, the served audience, the virtual users, the frontends, and the
virtual users already assigned to apps in source. A refusal is returned at once. The rules inside
`refuseNewApp` are covered in
[a virtual user belongs to one app and an audience gets one app](a-virtual-user-belongs-to-one-app-and-an-audience-gets-one-app.md).

Second, every virtual user the caller names must be declared in a `defineVirtualUsers({…})` call in the source.
Any that are not are refused with a message telling the user to add them.

Only then does it call `assignVirtualUserApp(repoDir, virtualUsers, slug)`. That function, in
`packages/cli/src/utils/app-scaffold.ts`, writes an `app` field into each named virtual user's declaration in
the virtual users source file, replacing an existing field if there is one. The declared field is what the
scenario runner reads to pick a virtual user's base URL, and the comment says a second list kept beside the app
could disagree with it.

**What this rules out:** writing the app onto virtual users before the audience and declaration checks pass, and
keeping the virtual-user-to-app mapping in a list outside the virtual user declarations.
