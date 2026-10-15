---
type: decision
title: Analytics identity resolvers run in declared order so consent is read before a cookie is minted
description: composeAnalyticsIdentity threads each resolver's output into the next, so a cookie-minting resolver sees the consent that an earlier resolver read
tags: core, analytics, consent
---

# Analytics identity resolvers run in declared order so consent is read before a cookie is minted

`composeAnalyticsIdentity` in `packages/core/src/analytics/compose-analytics-identity.ts:22-35`
runs the resolvers in the order given. Each one receives the accumulated result of
the ones before it (`:26`, `:29`), and its output is merged over that result (`:31-33`).

The doc comment at `:8-15` states the ordering rule: a resolver that mints a cookie
may do so only once consent has been read, so the consent reader has to come first.
A later resolver wins a key it sets (`:17-18`).

The cookie-side rule is in `a-first-party-cookie-is-written-only-after-its-purposes-consent.md`.
That note does not record the order in which the resolvers are composed.

**What this rules out:** running a cookie-minting resolver ahead of the consent
reader, and merging independent resolver results so that no resolver sees another's output.
