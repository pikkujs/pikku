---
'@pikku/cli': patch
---

Make the virtual user scaffold typecheck in the project it is generated into.

Three shapes in `virtual-user.gen.ts` were written against what the scaffold
knows rather than what an application actually has, and every one of them was
an error the moment a real project turned `scaffold.virtualUser` on:

- `startVirtualUserRun` asked for `config: { nodeEnv?: string }`. An
  application's `Config` is its own interface and need not declare `nodeEnv` at
  all — and a target type whose properties are all optional shares none with
  such a config, so TypeScript rejected the whole call. It takes `unknown` and
  reads `nodeEnv` off it.
- It also asked for `rpc.invoke(name: string, …)`. A project's generated
  `invoke` is generic over its own map's keys and `string` is not one of them.
  The parameter now names the one function the scaffold dispatches.
- `listVirtualUserSchedules` passed `input: null`, which is not one of the two
  things an input may be. The field is omitted.

It also signed in at the wrong door. `createPersonas` was called without a
sign-in or RPC path, so a run against an application that mounts auth anywhere
but the root — `/api/auth` is the usual place — signed in against a 404 and
spent its whole budget reasoning about why every call failed. It now reads
`SCENARIO_SIGN_IN_PATH` and `SCENARIO_RPC_PATH`, the same two variables a
scenario run reads, because a virtual user goes through exactly the doors a
scenario does.
