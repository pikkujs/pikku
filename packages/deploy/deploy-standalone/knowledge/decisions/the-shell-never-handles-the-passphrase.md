---
type: decision
title: The shell never handles the passphrase
description: The server boots locked and is unlocked by an HTTP call from the frontend; Rust neither prompts for, holds, nor forwards a key
tags: [tauri, desktop, data-lock, security]
---

# The shell never handles the passphrase

A desktop build looks like the natural place for a native password prompt. It
is not one, and the generated shell contains no reference to a passphrase at
all.

Unlocking is already built, in core, and it is an HTTP concern:
`wireDataLock` serves an unlock endpoint, `DataLock` holds the key material, and
the `requireUnlocked` middleware refuses every classified query until the
passphrase arrives. The server boots locked, serves the app shell and the unlock
screen, and unlocks over localhost HTTP — the unlock screen is a page in the
frontend like any other.

Keeping Rust out of it means there is exactly one unlock path, exercised the
same way in a browser, in `pikku dev`, and in a packaged app. A native prompt
would be a second implementation of the most security-sensitive flow in the
product, reachable only in the configuration that is hardest to test, and it
would put key material in a process that has no reason to see it.

A test asserts this rather than trusting it: the generated `main.rs`, comments
stripped, must not mention a passphrase, a password or an unlock.

**What this rules out:** a native unlock dialog, passing a key to the sidecar as
an environment variable or an argument, storing the passphrase in the OS
keychain from Rust, and any unlock path that exists only on desktop.
