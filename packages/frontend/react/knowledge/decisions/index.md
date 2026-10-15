---
type: overview
title: Decisions
description: Rules chosen in the React feature-flag client, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [Analytics drops buffered events when consent is withdrawn rather than holding them](analytics-drops-buffered-events-when-consent-is-withdrawn.md) — The browser analytics client checks its enabled() gate when an event is recorded and again at each flush, and empties the buffer without sending when consent is off
- [Client-side flag reads are advisory; the server re-checks availability on every call](client-side-flag-reads-are-advisory.md) — The React feature-flag map decides what to show, and the runner checks flag availability again on each call
<!-- /pikku:knowledge-index -->
