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

## The check walks whichever generated directory a package ships

`dist/.pikku` is the target shape (below), but the check cannot assume it: the
shape is what this work moved addons *to*, and a package that has not moved —
or was published before it did — still carries `.pikku` at the root, listed in
`files` and mapped by `exports` as `./.pikku/*`. There it is a public entry
point rather than build input, and its imports climb one level fewer — to
`<pkg>/src` and `<pkg>/types` — where the copy under `dist` reaches
`<pkg>/dist/src` and `<pkg>/dist/types`. Two roots, two ways to fall outside
the tarball, so the check walks whichever ones are actually shipped rather than
the one it would prefer to find.

`exports` and `imports` get the same treatment one level up: a target outside
the published file set is the same defect, and the one the import walk cannot
see, because nothing inside `dist/.pikku` mentions it. That is how a `#pikku`
still pointing at `./.pikku/pikku-types.gen.ts` hides.

## An addon's entry points all resolve under dist

Everything an installed package reaches for lives under `dist`; the addon's own
build resolves `#pikku` through tsconfig `paths`, so nothing in `exports` or
`imports` has to point into the source tree, and `files` is just `["dist"]`.
The alternative — shipping `src/` and `types/` at the root so the existing paths
resolve as written — publishes TypeScript source and a second copy of
everything `dist` already has.

Checking only `dist` is what let the root `.pikku` stay broken through the first
round of fixes: in the published `@pikku/addon-assemblyai@0.1.4` tarball, `.pikku`
ships `.gen.ts` files importing a `../../src/` and `../types/` that the tarball
does not contain, and the `pikku-bootstrap.gen.js` that consumers import through
that subpath exists only under `dist`. Everything resolved locally through the
workspace link and none of it resolved on install.

## Only a package that publishes gets the dist shape

The shape describes a tarball, so it means nothing for a `private` package —
and applying it there actively breaks: `exports` *is* enforced across a
workspace link, so repointing a private fixture at `dist` makes every consumer
demand a directory that only a build produces. The three `verifiers/db-schema`
and `verifiers/addon-registry` fixtures have no build script at all, so `dist`
never exists for them; the five `e2e/packages` addons build, but their metadata
is read straight from the source tree before any build has run. Repointing all
eight left the db-schema verifier unable to resolve
`dist/.pikku/db/pikku-db-meta.gen.json` and every e2e addon reporting "no
function metadata".

`isAddonPackage` already draws this line — it returns false for `private` — so
the checks and the shape agree: a package the registry never sees is consumed
from source.
