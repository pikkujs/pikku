---
type: decision
title: A persona belongs to one app and an audience gets one app
description: The app scaffold refuses a new app for an audience another app already serves, and refuses a persona that already belongs to a different app
tags: cli, personas, apps, scaffold
---

# A persona belongs to one app and an audience gets one app

The app-scaffold check in `packages/cli/src/utils/app-scaffold.ts` returns a refusal message, or null when creating the
app is allowed. Its comment says that a role inside an app changes nav and buttons and nothing else, so two kinds of user
are not a reason to split (`app-scaffold.ts:113-115`).

If another app already serves the same audience, the refusal says those people share one app and to add the personas
there (`app-scaffold.ts:116-126`). For each other app, if any persona already belongs to it, the refusal says a person
signs into one app and to move them out first (`app-scaffold.ts:128-139`).

**What this rules out:** adding a persona to a second app, and creating a new app for an audience another app serves.
