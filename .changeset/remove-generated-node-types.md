---
'@pikku/cli': patch
---

Stop generating `console/pikku-node-types.gen.ts`

The file held two aliases and nothing else: `NodeCategory`, which was `never`
unless a project declared addon categories, and `NodeRPCName`, which was
`keyof FlattenedRPCMap` — the RPC map the user already imports. Neither had a
consumer anywhere in the repo, the templates or the verifiers, and both are
derivable at the point of use, so the codegen step existed to write a file that
was re-exported through `#pikku` and then never named.

Gone with it: the `pikkuNodeTypes` command, its two `all` workflow steps, its
`bootstrap` invocation, and the `nodeTypesFile` config entry. The function-types
command deletes any copy left at the old path, since `tsc` compiles every file
in the output tree whether the hub re-exports it or not.
