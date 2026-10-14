---
type: decision
title: Open-source auth works without Fabric
description: Every persona and virtual-user path must work in an app that runs no Fabric code; Fabric is a layer on top that supplies its own credentials, never a dependency
tags: services, auth
---

# Open-source auth works without Fabric

Personas, virtual users and staged impersonation must all work in an open-source
app with no Fabric service, no Fabric signing key and no Fabric-issued token.
Fabric may add its own way in (an operator token exchanged for a session, a
hosted console), but nothing in core, the CLI or the better-auth service may
require it.

This rules out any design where Fabric is the issuer of the credential a persona
or virtual user presents. It is why the signed persona token was dropped: a
signer that only exists in Fabric cannot be the basis for an open-source feature.

The existing operator path (`OperatorSignIn`, the `x-pikku-impersonate-user-id`
header sent with a Fabric token) is a Fabric layer. Whether it is removed from
OSS is an open question: see [the actor secret and operator paths](../../questions/actor-secret-and-operator-paths-stay-or-go.md).
