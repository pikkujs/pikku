---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

A trigger source can now say which user an event belongs to (#1618): `trigger.invoke(data, { pikkuUserId })`. The target RPC or workflow runs as that user, the way a queue job or workflow run carrying a `pikkuUserId` does — its `type: 'wire'` credentials and stored session resolve for them, and a started workflow records the id on the run. Without the option nothing changes: the target runs as nobody.

The user is a separate argument so nothing in the event data can choose it; a source should pass only a user it established itself, such as the one whose credential it polled with. A `pikkuUserId` that is not a non-empty string drops the event with an error log.

`PikkuTrigger` and the new `TriggerInvokeOptions` are exported from `@pikku/core/trigger`. A custom `PikkuTriggerService` subclass must pass the new optional `options` argument of the `onTrigger` callback through to `onTriggerFire`, or the user never reaches the target.
