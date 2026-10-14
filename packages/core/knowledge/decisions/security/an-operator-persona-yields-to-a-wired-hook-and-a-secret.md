---
type: decision
title: HTTP persona sign-in picks one mechanism and refuses to combine them
description: Persona sign-in resolves in the order wired hook, then operator token, then actor secret, and a wired hook with a secret or operator token is a configuration error
tags: core, personas, sign-in, configuration
---

# HTTP persona sign-in picks one mechanism and refuses to combine them

`packages/core/src/services/http-personas.ts` resolves how a persona signs in,
in this order: a wired hook (`wirePersonaSignIn`), then the operator token, then
the actor secret.

Setting a wired hook together with a secret or an operator token throws. Two
mechanisms for one persona would make it unclear which one authenticated the
request.

In the virtual-user scaffold (`virtual-user-scaffold.ts`), the operator token
wins over the actor secret, and the wired hook wins over both. `signInPathFor`
maps the choice to `/sign-in/fabric` or `/sign-in/actor`.

**What this rules out:** silently choosing between a wired hook and a credential
the app also supplied.
