---
type: overview
title: Decisions
description: Rules chosen in the React feature-flag client, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [An app opens in the locale active.json names, falling back to the base locale](an-app-opens-in-the-locale-active-json-names.md) — createAppI18n builds the locale store with the default locale from active.json as the initial locale, instead of detecting the browser language, and falls back to Paraglide's base locale when that locale was never compiled
- [Analytics drops buffered events when consent is withdrawn rather than holding them](analytics-drops-buffered-events-when-consent-is-withdrawn.md) — The browser analytics client checks its enabled() gate when an event is recorded and again at each flush, and empties the buffer without sending when consent is off
- [Client-side flag reads are advisory; the server re-checks availability on every call](client-side-flag-reads-are-advisory.md) — The React feature-flag map decides what to show, and the runner checks flag availability again on each call
<!-- /pikku:knowledge-index -->
