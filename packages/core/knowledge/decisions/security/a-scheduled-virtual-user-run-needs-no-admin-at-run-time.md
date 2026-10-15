---
type: decision
title: A scheduled virtual-user run needs no admin at run time
description: An admin may start a virtual-user run, but the run itself never depends on an admin being signed in or on an admin's credential
tags: services, auth, workflow
---

# A scheduled virtual-user run needs no admin at run time

The people who set up virtual-user runs are not technical. A run must keep
working after they stop being around, and it must not depend on any admin being
signed in or on any admin's credential.

An admin clicking "run" or creating a schedule is the authorization step. Once
the schedule exists, the run is started by the app's own scheduler and performs
the test as a provisioned test account (see
[virtual-user-flagged users only](virtual-user-sign-in-only-works-for-virtual-user-flagged-users.md)).

The run presents no credential at all. `executeVirtualUserRun`
(`packages/core/src/wirings/virtual-user/virtual-user-scaffold.ts`) builds its
virtual users with `signIn: inProcessSignIn(auth)`, which calls the app's
server-only sign-in endpoint through `auth.api`
(`packages/core/src/services/virtual-user-sign-in.ts`). The code asking is the
app, so there is no key for an admin to hold or refresh.

**What this rules out:** a run that borrows an admin's session or key, and a run
that depends on a person to refresh a credential.
