---
type: overview
title: Questions
description: Things asked of gateways/slack and not yet answered
---

# Questions

Something asked and not yet answered. The choice stays, the doubt gets recorded.

<!-- pikku:knowledge-index -->
- [Does a non-numeric Slack timestamp skip the replay window?](does-a-non-numeric-slack-timestamp-skip-the-replay-window.md) — verifySlackSignature compares Number(timestamp) with the clock, so a non-numeric timestamp yields NaN, the five-minute check never fires, and only the HMAC decides
- [Is the Slack OAuth state checked on exchange?](is-the-slack-oauth-state-checked-on-exchange.md) — buildSlackInstallUrl puts an optional state into the install URL, but exchangeSlackOAuthCode takes no state and does not check one
<!-- /pikku:knowledge-index -->
