---
type: decision
title: Loading agent context waits for a tool result that may still be landing
description: An interrupted run's tool can still be writing to the thread, and in voice the next turn arrives within seconds — soon enough to load context missing what it is about to be asked about
tags: core, ai-agent
---

# Loading agent context waits for a tool result that may still be landing

Before a turn loads its thread, it settles any tool whose run was interrupted
but whose result is still being written to that thread.

The window is small and, on a typed interface, usually irrelevant — a person
takes seconds to write the next message. In voice it is not: the next turn lands
within a second or two of the last one. Without the wait, the model loads a
thread that is missing the very result the user is about to ask about, and
answers as though the tool never ran.

**What this rules out:** treating the settle as belt-and-braces and dropping it
to save a round trip. The failure it prevents is a confidently wrong answer, not
an error, and it only appears on the fastest transport.
