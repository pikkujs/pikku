---
type: overview
title: Decisions
description: Rules chosen in playwright, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [A browser scenario name resolves to a declared virtual user, and that virtual user's app picks the URL](a-browser-virtual-user-browses-its-own-apps-url.md) — Each browser session name resolves to a virtual user from defineVirtualUsers, and that virtual user's app decides which app URL the session browses
- [Each virtual user opens its own browser context](each-virtual-user-opens-its-own-browser-context.md) — A new VirtualUserSession gets a fresh Playwright BrowserContext, so one virtual user's cookies and session never reach another
<!-- /pikku:knowledge-index -->
