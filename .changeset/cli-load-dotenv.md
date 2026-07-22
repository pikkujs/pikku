---
'@pikku/cli': patch
---

Load `.env` from the working directory before running any command.

`LocalSecretService` reads `process.env` and nothing else, so a project keeping
`BETTER_AUTH_SECRET` in `.env` got `Requested secret not found` on its first
sign-up — an error that names no key and points at no file. This could not be
left to the package manager: the CLI has a node shebang, so `bunx pikku dev`
execs node and bun's own `.env` injection never reaches the process.

Real environment variables still win over the file.
