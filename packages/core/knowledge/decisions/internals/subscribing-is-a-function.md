---
type: decision
title: Subscribing is a function
description: A client never names a topic. A pikkuSubscribeFunc returns it after the normal session, scope and permission checks, and the runtime subscribes the channel to what it returned.
tags: core, event-hub, channel, security
---

# Subscribing is a function

`eventHub.subscribe(topic, channelId)` took the topic from the client, so any
connected socket could follow any topic and the only gate was whatever the
handler remembered to check. A subscription is now a `pikkuSubscribeFunc`: it is
wired as an SSE route or a channel message route, runs the ordinary function
path (session, scopes, `pikkuPermission` with its database reads, fail closed),
and its return value is the topic. If it returns, the runtime subscribes the
channel; if it throws, nothing is subscribed.

The topic is the framework's answer, not the client's: it is not echoed back. On
HTTP the function runs before the stream opens, so a refusal is a real 401 or
403 and no stream is held. On a channel a throw becomes an error frame.

A public topic is wired `auth: false`, as any public route is. `skipWithoutSession`
belongs to `pikkuAuth` and `pikkuPermission` guards and is not used here.

**What this rules out:** a `subscribe` on any service, a hand-written topic
union, and an open handler that subscribes to whatever string arrives.
A `${string}` topic shape guards typos in `publish`, not access: access is the
function's permission.
