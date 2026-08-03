---
type: decision
title: Scenarios, steps and personas live in files named for them, and validate errors when they do not
description: pikkuScenario/pikkuFeature/pikkuScenarioStep must be in *.scenario.ts, *.scenarios.ts or *.steps.ts, and definePersonas/runVirtualUser in *.virtual-user.ts or *.vu.ts — an error, because the mixing is only cheap to undo while it is one file
tags: cli, validate, scenarios, personas
---

# Scenarios, steps and personas live in files named for them, and validate errors when they do not

A `pikkuScenario` declared beside the functions it exercises reads as more of
the same file. The wiring, the function, and the test of the function arrive in
one scroll, and the scenario is the part that gets lost — you cannot tell from
a directory listing which files ship and which files test.

So `validate` requires the declaration to be in a file named for what it is:

| declaration | file |
| --- | --- |
| `pikkuScenario`, `pikkuFeature` | `*.scenario.ts`, `*.scenarios.ts` |
| `pikkuScenarioStep` and its platform/addon variants | `*.steps.ts` (or the above) |
| `definePersonas`, `runVirtualUser` | `*.virtual-user.ts`, `*.vu.ts` |

Three suffixes for scenarios rather than one, because the split that matters is
scenarios apart from application code, not a particular spelling — `.steps.ts`
holds the steps, `.scenarios.ts` holds the scenarios that call them, and a
project that already made that split does not have to rename anything.

**Error, not warning.** The mixing is cheap to undo while it is one file and
expensive once it is thirty, and a warning is exactly the signal a project
learns to scroll past. This is the one place where the scenario checks are
strict: everything else `validate` says about scenarios (no personas declared,
no actor sign-in, no environments) is a warning, because those describe an
under-tested project rather than an unreadable one.

**Personas are the virtual-user file** because there is no `defineVirtualUsers`
to look for. That name was retired in favour of `definePersonas`: a virtual user
is derived rather than authored — the function meta becomes its catalogue, the
scenario meta becomes its intents, the declared personas become its identities.
The persona list is the only part a project writes, so it is the part that has
to be findable by filename.

Matching is on the call (`\bpikkuScenario\s*\(`), not the import, so an aliased
import cannot slip past and a mention in a comment or a string does not trip it.
Generated files are exempt — codegen puts things where it likes.

**What this rules out:** a scenario in a function file; a step in a wiring file;
personas in a general-purpose `personas.ts`; and reporting any of these as a
warning that a project can carry indefinitely.
