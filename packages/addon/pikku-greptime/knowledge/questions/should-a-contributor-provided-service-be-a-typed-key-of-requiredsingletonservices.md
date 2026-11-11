---
type: question
title: Should a contributor-provided service be a typed key of RequiredSingletonServices?
description: telemetryStore is provided at run time but is not in the generated type, so an app reads it through a cast
tags: [contributors, types, services]
---

# Should a contributor-provided service be a typed key of RequiredSingletonServices?

`provides: ['telemetryStore']` is not recorded in the contributor metadata or the
generated `RequiredSingletonServices`, so the verifier app passes the service on and
reads it through an untyped destructure, as the nats verifier casts. This is the known
contributor gap (provides is not in the metadata); the addon does not work around it in
core. If it is fixed, the cast in `verifiers/addon-greptime` can go.
