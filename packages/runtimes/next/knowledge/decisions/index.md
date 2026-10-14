---
type: overview
title: Decisions
description: Rules chosen in runtimes/next, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [A static Next action request answers null for every cookie and header and an empty object for the header map](a-static-action-request-has-no-cookies-or-headers.md) — PikkuActionNextRequest reads cookies() and headers() only when it was built dynamic, so static page generation sees no credentials instead of an error
- [getSession returns whatever the middleware leaves in the session](get-session-returns-what-the-middleware-leaves.md) — The Next.js getSession helper runs the given middleware and returns the stored session with no check of its own
<!-- /pikku:knowledge-index -->
