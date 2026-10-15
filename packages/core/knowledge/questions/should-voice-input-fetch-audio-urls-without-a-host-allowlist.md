---
type: question
title: Should voiceInput fetch audio URLs when no host allowlist is configured?
description: With no allowedAudioHosts, the audio URL is fetched through safeFetch with no allowlist, so any public host is reachable
tags: core, agent, voice, ssrf
---

# Should voiceInput fetch audio URLs when no host allowlist is configured?

`fetchAsUint8Array` in `packages/core/src/wirings/agent/voice-input.ts:57-61` calls
`safeFetch` with `{ allowedHosts: allowedAudioHosts }`. That value is optional.
The caller passes `config.allowedAudioHosts` for a URL audio part (`:136-138`).

In `packages/core/src/utils/safe-fetch.ts:269-273`, with no allowlist the only
host check is the private-host refusal. So a URL that is not on a list, but is
public, is fetched when no list is configured.

**Question:** should `voiceInput` require `allowedAudioHosts` before it fetches a
URL, or is the private-host block meant to be enough? The code takes the second
option. No note or comment in the file says which is intended.
