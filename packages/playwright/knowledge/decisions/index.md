---
type: overview
title: Decisions
description: Rules chosen in playwright, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [A browser scenario actor is filled by a persona, and the persona's app picks the URL](browser-actors-are-filled-by-personas.md) — Each browser actor name resolves to a persona from definePersonas, and that persona's app decides which app URL the session browses
- [Each actor opens its own browser context](each-actor-opens-its-own-browser-context.md) — A new ActorSession gets a fresh Playwright BrowserContext, so one actor's cookies and session never reach another
<!-- /pikku:knowledge-index -->
