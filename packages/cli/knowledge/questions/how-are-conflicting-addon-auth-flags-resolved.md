---
type: question
title: How should conflicting addon auth flags resolve when a scaffold is generated?
description: resolveAddonAuth checks the delegated spec first, then none, then shared, then credential or oauth, so a --secret with an --oauth flag falls through to the credential path
tags: cli, addons, auth, scaffold
---

# How should conflicting addon auth flags resolve when a scaffold is generated?

`resolveAddonAuth` in `packages/cli/src/functions/commands/new-addon.ts` picks the addon's auth mode from the flags and the
spec (`new-addon.ts:1140-1144`). The order of the checks, as written, is:

1. A `--auth` value outside `user`, `shared` or `none` throws (`new-addon.ts:1155-1157`).
2. A spec with `delegated` returns the delegated mode, with a bearer credential (`new-addon.ts:1158-1164`).
3. `--auth none` returns the none mode (`new-addon.ts:1166-1168`).
4. `--auth shared`, or `--secret` with neither `--credential` nor `--oauth`, returns the shared mode (`new-addon.ts:1169-1174`).
5. Otherwise the explicit credential or oauth flag, or the spec's header name, decides the credential type
   (`new-addon.ts:1175-1180`).

Two cases are unclear from the code alone. `--secret --oauth` is not shared, since the shared test needs no `--oauth`, so
it falls through to the oauth credential path. A spec marked delegated wins over `--auth shared` and `--auth user`. The
doc comment says the flags are read first and the spec second (`new-addon.ts:1140-1144`), but that does not state what
happens on a conflict. The question is whether these precedences are intended. The code is kept as written.
