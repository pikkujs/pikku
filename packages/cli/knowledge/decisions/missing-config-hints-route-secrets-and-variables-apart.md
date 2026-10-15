---
type: decision
title: Missing-config hints send secret gaps to secrets set and variable gaps to variables set
description: missingConfigHints names pikku cloud secrets set for missing secrets and pikku cloud variables set for missing variables, in separate hints
tags: cli, cloud, secrets, variables
---

# Missing-config hints send secret gaps to secrets set and variable gaps to variables set

`missingConfigHints` in `packages/cli/src/cloud/lib/deployment.ts` builds the hint for a deploy blocked on
missing config. The doc comment says secrets and variables are set by two commands, and that `secrets set`
seals a value the stage can never read back while `variables set` writes one it can. Naming one command for
both would send someone to a command that refuses their value (`deployment.ts:75-82`).

A missing secret gets a hint naming `pikku cloud secrets set` (`deployment.ts:91-95`). A missing variable gets
a hint naming `pikku cloud variables set <name> <value>` (`deployment.ts:96-100`). With neither, a combined hint
is returned (`deployment.ts:101-105`).

**What this rules out:** a single hint that names one command for both kinds of value.
