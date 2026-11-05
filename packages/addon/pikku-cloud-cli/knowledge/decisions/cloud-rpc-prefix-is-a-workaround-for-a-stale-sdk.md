---
type: decision
title: The cloud: rpc prefix in lib/http.ts is a workaround for a stale snapshot SDK
description: cloudRpcName hard-codes which functions stay bare and which are machine:, and prefixes the rest with cloud:, because the snapshot SDK in src/sdk carries bare names
tags: cli, cloud, rpc
---

# The cloud: rpc prefix in lib/http.ts is a workaround for a stale snapshot SDK

`cloudRpcName` in `packages/addon/pikku-cloud-cli/src/lib/http.ts` keeps `BARE_RPCS`
(`requestCliAuth`, `pollCliAuth`, `submitFinding`) and `MACHINE_RPCS` (`createSandboxChange`)
as hard-coded lists, and prefixes every other name with `cloud:`.

**Why it exists:** production serves the cloud API functions under the `cloud:` addon
prefix, but the snapshot SDK in `src/sdk` is a stale hand-copied map with bare names. No
generate script and no controlplane-generated map with `cloud:` keys exists, so the CLI
corrects the names at call time.

**What breaks:** the two lists are the only record of which functions are not under
`cloud:`. If the controlplane moves another function, the lists go stale and the CLI
returns 404 for it again, with no build or type error to say so.

**Proper fix:** regenerate the snapshot SDK from the controlplane's real map, so names and
types come from the server, then delete `cloudRpcName` and both lists.
