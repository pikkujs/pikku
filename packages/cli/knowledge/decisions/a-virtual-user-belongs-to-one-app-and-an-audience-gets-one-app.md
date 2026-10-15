---
type: decision
title: A virtual user belongs to one app and an audience gets one app
description: The app scaffold refuses a new app for an audience another app already serves, and refuses a virtual user that already belongs to a different app
tags: cli, virtual-users, apps, scaffold
---

# A virtual user belongs to one app and an audience gets one app

`refuseNewApp` in `packages/cli/src/utils/app-scaffold.ts` returns a refusal message, or null when creating the
app is allowed. Its comment says that a role inside an app changes nav and buttons and nothing else, so two kinds of user
are not a reason to split.

If another app already serves the same audience, the refusal says those people share one app and to add the virtual users
there. For each other app, if any named virtual user already belongs to it — by the `app` field in source or the app's
own `virtualUsers` list — the refusal says a person signs into one app and to move them out first.

**What this rules out:** adding a virtual user to a second app, and creating a new app for an audience another app serves.
