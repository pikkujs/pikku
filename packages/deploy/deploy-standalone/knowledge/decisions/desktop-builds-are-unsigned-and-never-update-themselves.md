---
type: decision
title: Desktop builds are unsigned and never update themselves
description: Code signing, notarization and auto-update are deliberately absent from the first version of the Tauri shell — a known limitation, not an oversight
tags: [tauri, desktop, limitations, distribution]
---

# Desktop builds are unsigned and never update themselves

The generated shell has no signing pipeline and no updater. Both were left out
on purpose, and both need building before anything is distributed to people who
did not compile it themselves.

What this means in practice today:

- **macOS Gatekeeper will refuse the app on first launch.** An unsigned,
  un-notarized `.app` downloaded from anywhere gets quarantined; the user has to
  right-click → Open, or clear the quarantine attribute by hand. This is
  accepted for now.
- **Windows SmartScreen shows an unknown-publisher warning** for the same reason.
- **There is no update path.** A shipped build stays the version it was. Tauri's
  updater plugin is not wired in, no update endpoint exists, and — relevant
  later — the updater requires signing keys, so the two gaps have to be closed
  together rather than in either order.

Signing is not something the generator can quietly grow, because it needs
secrets the build machine has to hold: an Apple Developer ID certificate plus an
app-specific password or API key for notarization, and an Authenticode
certificate on Windows. That is CI configuration and key custody, not code
generation, which is why it is a separate piece of work rather than a flag.

**What this rules out for now:** distributing a build to end users without
telling them how to get past Gatekeeper, and any claim that a shipped desktop
app can be patched after release.
