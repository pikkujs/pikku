---
type: decision
title: Only functions marked `expose: true` enter a virtual user's catalogue
description: Absent is not permissive — an unexposed function 404s over rpc, so offering one spends a step to learn nothing about the product
tags: core, virtual-user
---

# Only functions marked `expose: true` enter a virtual user's catalogue

`expose: true` is what puts a function on the rpc transport, which is what the
shipped target is called over. The catalogue therefore treats an absent `expose`
as excluded rather than as unspecified-and-allowed.

Absent is not permissive here: an unexposed function returns 404, and offering
it costs the user a step and teaches nothing about the product. On the e2e app,
34 of 72 functions are in exactly that state — close to half a catalogue that
cannot be called at all.

**What this rules out:** defaulting the check to "include unless explicitly
hidden", which reads as the safer default and produces a catalogue that is
mostly dead ends.
