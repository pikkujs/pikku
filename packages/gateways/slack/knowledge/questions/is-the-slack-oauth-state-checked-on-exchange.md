---
type: question
title: Is the Slack OAuth state checked on exchange?
description: buildSlackInstallUrl puts an optional state into the install URL, but exchangeSlackOAuthCode takes no state and does not check one
tags: [slack, oauth]
---

# Is the Slack OAuth state checked on exchange?

`buildSlackInstallUrl` in `packages/gateways/slack/src/slack-oauth.ts` accepts an
optional `state` and adds it to the install URL (lines 51-64).

`exchangeSlackOAuthCode` takes `clientId`, `clientSecret`, `code` and `redirectUri`
only (lines 19-23). It posts those to `oauth.v2.access` (lines 26-31) and returns the
`botToken` and related fields (lines 37-45). It has no parameter for the state and
does not compare one.

Within `packages/gateways/slack`, the functions are only re-exported
(`packages/gateways/slack/src/index.ts:19-20`). A search of `packages`, `examples`
and `templates` found no other caller. So the state check, if there is one, is not
in this package or any consumer in this repository.

Question: is the state meant to be verified by the caller that receives the redirect,
or is it an unverified parameter? The code says nothing either way.
