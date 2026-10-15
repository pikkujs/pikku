---
type: decision
title: The CLI loads the project env file without overriding a real environment variable
description: The pikku entry point reads .env from the working directory, and its fallback parser assigns only variables not already set, so a real environment variable wins
tags: cli, env, secrets
---

# The CLI loads the project env file without overriding a real environment variable

`loadEnvFile` in `packages/cli/bin/pikku.ts` reads `.env` from the working directory (`pikku.ts:30-32`). The
doc comment says this is needed because the CLI's shebang runs node, so bun's own `.env` injection never
reaches the process, and that a real environment variable must always beat a checked-out file
(`pikku.ts:15-23`).

When `process.loadEnvFile` exists, it is called (`pikku.ts:34-36`). Its override behaviour is node's and is not
shown in this repo. When it does not exist, the fallback parser assigns with `??=` (`pikku.ts:38-44`), so a
variable already set is kept.

**What this rules out:** a `.env` value replacing a variable the shell already exported. The guarantee on the
node path depends on node, which this file does not show.
