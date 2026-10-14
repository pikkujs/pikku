---
type: question
title: Does a non-numeric Slack timestamp skip the replay window?
description: verifySlackSignature compares Number(timestamp) with the clock, so a non-numeric timestamp yields NaN, the five-minute check never fires, and only the HMAC decides
tags: [slack, signatures, replay]
---

# Does a non-numeric Slack timestamp skip the replay window?

`verifySlackSignature` in `packages/gateways/slack/src/slack-signature.ts` rejects
requests older than 300 seconds with `Math.abs(now - Number(timestamp)) > 300`
(`slack-signature.ts:24-28`). `timestamp` is the raw `x-slack-request-timestamp`
header.

If the header is not a number, `Number(timestamp)` is `NaN`. `Math.abs(NaN) > 300` is
false, so the function does not return false at that line. It goes on to build the
base string `v0:{timestamp}:{body}` (`slack-signature.ts:31`) and compare the HMAC
(`slack-signature.ts:33-35`).

The adapter checks only that the header is present (`slack-gateway-adapter.ts:143-147`).
It does not parse the value before calling `verifySlackSignature`.

So a request with a non-numeric timestamp is not refused by the window, and it is
accepted only if its HMAC over that exact timestamp matches. Producing that HMAC needs
the signing secret. The check that still applies is the HMAC, so this is a gap in the
replay check, not an unsigned path.

Open: is a non-numeric timestamp meant to pass the window? The code neither rejects
it nor comments on it.
