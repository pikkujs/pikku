---
type: decision
title: Adding an app writes the new app onto its personas only after the refusal and declaration checks pass
description: The app-new command refuses on the scaffold rules and on undeclared personas, and only then records the app on each named persona in source
tags: cli, personas, apps, scaffold
---

# Adding an app writes the new app onto its personas only after the refusal and declaration checks pass

The `app new` command in `packages/cli/src/functions/commands/app-new.ts` runs its checks in order before
it touches any files that define personas.

It first calls `refuseNewApp` with the slug, the served audiences, the personas, the frontends, and the
personas already assigned to apps in source (`app-new.ts:139-145`). A refusal is returned at once
(`app-new.ts:146`). The rules inside `refuseNewApp` are covered in
[a persona belongs to one app and an audience gets one app](a-persona-belongs-to-one-app-and-an-audience-gets-one-app.md).

Second, every persona the caller names must be declared in a `definePersonas({…})` call in the source.
Any that are not are refused with a message telling the user to add them (`app-new.ts:148-155`).

Only then does it call `assignPersonaApp(repoDir, personas, slug)` (`app-new.ts:161`). That function
writes an `app` field into each named persona's declaration in the personas source file, replacing an
existing field if there is one (`packages/cli/src/utils/app-scaffold.ts:207-225`). The declared field is
what the scenario runner reads to pick an actor's base URL, and the comment says a second list kept beside
the app could disagree with it (`app-scaffold.ts:200-206`).

**What this rules out:** writing the app onto personas before the audience and declaration checks pass, and
keeping the persona-to-app mapping in a list outside the persona declarations.
