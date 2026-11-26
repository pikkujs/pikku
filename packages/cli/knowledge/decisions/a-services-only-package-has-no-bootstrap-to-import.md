---
type: decision
title: A services-only package has no bootstrap to import
description: 'wireAddon on a package that exports its services meta and no bootstrap opts in to the services only; the app bootstrap imports nothing from it'
tags: [services, wire-addon, bootstrap, deploy]
---

# A services-only package has no bootstrap to import

A package can ship `pikkuService`s without being an addon, as
`@pikku/queue-nats` does. `wireAddon({ services })` is how an app opts in, and
the app bootstrap imports every wired package's `.pikku/pikku-bootstrap.gen.js`,
which such a package does not have, so the deploy bundle could not resolve it.

`isServicesOnlyPackage` in
`packages/cli/src/functions/commands/lazy-addon-bootstrap.ts` skips the import
only when the package's `exports` has `./.pikku/services/*` and neither
`./.pikku/*` nor the bootstrap itself. It reads what the package declares rather
than whether the file resolves, so an addon that has not been built still fails
the build.

Rejected: building such a package as an addon so that it has a bootstrap.
