---
type: decision
title: A native biometric prompt is not access control, and the next-steps output says so
description: The biometric native API entry carries a caveat that a biometric check in front of a server-served screen is decoration, and the next-steps output prints it
tags: [deploy, standalone, tauri, auth]
---

# A native biometric prompt is not access control, and the next-steps output says so

`NATIVE_APIS` in `packages/deploy/deploy-standalone/src/tauri/native.ts` has a `biometric` entry (lines 48-62).
Its `caveat` (lines 60-61) reads: "Authenticates a person; it stores nothing. A biometric check that gates a screen the
server would serve to anyone is decoration — the session still has to be authorised server-side."

The caveat is printed by `packages/deploy/deploy-standalone/src/tauri/next-steps.ts` (lines 102-103), which writes
`<api name>: <caveat>` for each native API the project uses.

**What this rules out:** reading a biometric prompt as the thing that protects a screen. The server still has to
authorise the session behind it.
