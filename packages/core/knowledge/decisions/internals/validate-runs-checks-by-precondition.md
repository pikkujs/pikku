---
type: decision
title: pikku validate runs every applicable check, it does not detect a project kind
description: one `pikku validate` replaces `pikku workspace validate`; checks declare a precondition and run wherever it holds, because the repos that matter are an app and a pile of addons at the same time
tags: cli, validate, addons
---

# pikku validate runs every applicable check, it does not detect a project kind

`pikku workspace validate` was named after one of the things a repo can be.
Adding a second — "is this addon publishable" — invited a second command,
`pikku addon validate`, and that is where the naming falls apart: the addons
repo is a workspace *containing* 217 publishable addons. Standing at its root,
`pikku addon validate` would have to refuse or sweep every package, at which
point it is doing the workspace thing anyway. The two nouns were never
alternatives.

So there is one command, and it does not detect a kind and dispatch. Each check
declares the condition under which it means anything, and runs wherever that
condition holds:

- `app-project` — a `pikku.config.json` with no `types/application-types.d.ts`
  beside it. The marker matters: an addon carries a `pikku.config.json` too, and
  the app-shaped checks would report every app convention it has no reason to
  follow, starting with a `packages/functions/` it will never have.
- `addon-package` — a non-private package that ships generated pikku output.
  Having a `.pikku` directory is not enough on its own: an app's
  `packages/functions` has one, and it is codegen for that app rather than
  something anyone installs. The signal is a `files`/`exports` that carries it
  into the tarball.

Detection-as-dispatch fails on the first repo that is two things at once.
Detection-as-precondition composes: the addons repo plans 217 addon checks and
no app check; the online-shop template plans one app check and no addon check;
a repo that is both plans both.

## Targets come from walking, not from `workspaces`

The field is an array in one repo and `{ packages: [...] }` in the next, spells
the same layout as `packages/**` or as six explicit globs, and a package that is
real but unlisted is exactly the kind of thing worth validating. So discovery
walks the tree for `package.json` files and lets the preconditions decide.
Over-collecting targets is free; guessing the glob dialect is not.

## A run that checked nothing must not print a tick

The failure mode of auto-detection is that finding nothing looks exactly like
finding everything and liking it. When no check applies, the renderer says so
and names what it looked for, rather than reporting success.

## The check the addon case exists for

Every relative import in a shipped generated file must resolve to a file that is
itself shipped — stated as a property, not as "the build script must copy
`types/`". The build script is not the only way to get this wrong and will not
always be a `cp`; the generated files already declare what they need.

That property was false in all 217 published addons. `cp -r .pikku dist/`
shipped the generated output but not the `types/application-types.d.ts` it
imports, and `tsc` never emits a hand-written `.d.ts` to `outDir`, so nothing
put it in `dist`. Consumers got 8 unresolved-module errors plus 6
`RequiredServices does not satisfy CoreSecretlessSingletonServices` follow-ons
inside `node_modules`, for merely depending on an addon. The scaffold template
had been right the whole time — `templates/function-addon` copies `types/` —
and the published packages had drifted from it with nothing watching.
