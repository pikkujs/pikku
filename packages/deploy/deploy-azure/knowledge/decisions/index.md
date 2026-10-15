---
type: overview
title: Decisions
description: Rules chosen in the Azure deploy target, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [Azure HTTP functions are registered with anonymous auth, leaving authentication to the Pikku runner](azure-http-functions-are-anonymous-and-the-runner-authenticates.md) — The generated Azure entry sets authLevel anonymous on every HTTP route, so the platform does no auth before the Pikku function runner
- [Azure local settings carry empty placeholders for secrets, never their values](azure-local-settings-carry-empty-placeholders.md) — generateLocalSettings writes every secret and variable as an empty string, so local.settings.json holds no secret values
<!-- /pikku:knowledge-index -->
