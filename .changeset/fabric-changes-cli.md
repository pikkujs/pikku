---
'@pikku/cli': patch
---

`pikku fabric changes` — six commands for working the todo list someone files from inside a deployed fabric stage: `list`, `show`, `claim`, `ask`, `shot`, `done`.

The queue and its RPCs already existed on fabric-api; what was missing was a way to reach them from a checkout. The point of these items is that they are worked locally — someone walks the deployed app, circles twenty things, and a harness with the repo and the app running empties the queue. Every command takes the project from `pikkufabric.config.json` unless `--project-id` says otherwise, and `list --pickup-only` skips items still inside their grace window so a batch someone is mid-way through typing is picked up together rather than one item at a time.

Two commands do work the API cannot. `shot --image <path>` reads and encodes the file itself and infers the content type from the extension, rather than making the caller put a multi-megabyte base64 argument on the command line. `done` defaults `--branch` and `--head-commit` from the checkout it runs in — those two values are what strike the item through on the page it was filed from, so a hand-typed sha that does not exist points the filer at nothing.

The vendored fabric RPC snapshot in `src/fabric/sdk/` is refreshed to the current API surface.
