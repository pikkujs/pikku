---
type: decision
title: The schema service is never stubbed, or tests validate nothing
description: createStubProxy returns undefined for the schema property so the real schema service is built — a stubbed one turns validation into a silent no-op
tags: services
---

# The schema service is never stubbed, or tests validate nothing

`createStubProxy` (`packages/core/src/services/stub-tracker.ts`) is passed as
`existingServices` to `createSingletonServices`, and its proxy answers every
property with `tracker.stub(prop)` — every property except `schema`, which
returns `undefined` so the service factory goes on to construct a real schema
service.

A stub's methods resolve `undefined` and record the call. Applied to
`validateSchema`, that means validation always "passes": a request missing a
required field, or carrying a wrong type, sails through. Every scenario that
believed it was exercising input validation would be asserting on nothing, and
would keep passing after validation broke. The one-line exception in the proxy is
what keeps the test suite honest.

**What this rules out:** simplifying the `get` trap to `return tracker.stub(prop)`
for all properties, and adding `schema` to any list of services a scenario is
allowed to fake. If a scenario needs schema behaviour changed, change the schema,
not the service.
