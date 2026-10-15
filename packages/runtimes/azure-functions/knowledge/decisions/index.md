---
type: overview
title: Decisions
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [The Azure handler factories pass every HTTP request to fetchData and run queue and timer work with no session](azure-handler-factories-do-no-authentication-of-their-own.md) — createAzureHandler converts the request and calls core's fetchData with nothing added, builds queue jobs from the message alone, and runs every scheduled task on each timer tick
<!-- /pikku:knowledge-index -->
