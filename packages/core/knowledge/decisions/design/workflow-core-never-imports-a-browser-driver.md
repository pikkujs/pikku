---
type: decision
title: Core declares the scenario browser surface structurally and never imports a driver
description: `@pikku/core` must stay dependency-free for edge runtimes, so playwright augments the interface instead of being imported by it
tags: workflow
---

# Core declares the scenario browser surface structurally and never imports a driver

`PikkuBrowserWire`, `TestIdSelector`, `ScenarioBrowserProvider` and
`ScenarioBrowserFailure` all live in `scenario-step.types.ts` as plain
structural types. `@pikku/core` deliberately never imports playwright — it has
to stay dependency-free for edge runtimes — so `@pikku/playwright` augments
`PikkuBrowserWire` via `declare module`, and `wire.browser.page` becomes a fully
typed Playwright `Page` only in a project that installs it. Declaring the
provider contract here is also what lets the CLI depend on core alone.

`reset` and `captureFailure` are optional on `ScenarioBrowserProvider` so a
driver written against an earlier version keeps compiling; the runner treats a
driver without them as one offering no isolation and no diagnostics.
`captureFailure` must never throw — a failure to capture must not replace the
failure being captured — and exists because a browser step fails with a selector
timeout that says nothing about *why* the page never rendered; the answer is
almost always in the page's own console and request errors, which the driver has
been collecting all along.

`TestIdSelector` is richer than a bare `data-testid` because one rarely names
exactly one element: `where` matches the element's own data attributes (so a
step asserts a status without reading translated copy back to the app), `prefix`
matches a family of ids, `containing` picks the match holding a piece of text,
and `within` scopes the lookup to one row or section. Core defines the shape;
the driver resolves it against a real page.

The same dependency discipline applies at runtime: `resolveScenarioActors` in
`pikku-scenario-service.ts` imports the HTTP actor client lazily, so even a
runner bundle only pays for the AI persona conversation loop when a scenario
actually signs an actor in.

**What this rules out:** importing playwright (or any driver) from core,
tightening `reset`/`captureFailure` to required, letting `captureFailure` throw,
reducing `TestIdSelector` to a plain string, or making the actor-client import
static.
