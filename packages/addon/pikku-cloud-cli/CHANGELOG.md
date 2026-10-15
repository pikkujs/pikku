# @pikku/addon-cloud-cli

## 0.12.2

### Patch Changes

- 57a1194: `pikku changes` is a board. Each change has one status, its column: backlog, ready, in progress, needs answer, done. `start <id...>` moves a ready change to in progress, `backlog <id...>` shelves it and `ready <id...>` brings it back; `file --backlog` files straight into the backlog. A claim lives on the changeset's lease, not on the change, so a change left in progress after its lease lapses is picked up again by `next`. `claim`, `wait` and `next` skip the backlog. `ask` and `shot` park a change as needs answer and record whether it needs a question or a visual answer. `list` shows the columns with counts and badges for claimed and abandoned work. Stores written by older versions are migrated on read.
- 8913251: The cloud CLI reads its token from `PIKKUSTUDIO_API_KEY` instead of `PIKKUSTUDIO_TOKEN`, matching the name Pikku Studio shows for an API key. Rename it wherever you set it.
- Updated dependencies [57a1194]
  - @pikku/addon-changes-cli@0.12.2
  - @pikku/cli@0.12.188

## 0.12.1

### Patch Changes

- bf9bb86: `pikku cloud` moves out of the CLI into `@pikku/addon-cloud-cli`, which the CLI wires with `wireAddon` and `refCLI('cloud:cloudCommands')`, so `pikku cloud …` resolves exactly as before for anyone who installs `@pikku/cli`. `@pikku/cli/cloud` is gone: the typed Pikku Studio Cloud client is `@pikku/addon-cloud-cli/client`, which `@pikku/addon-console` now imports. The cloud addon registers its changes backend through `@pikku/addon-changes-cli/backend`, and `pikku validate` asks it for the checks that need a Pikku Studio Cloud project over RPC.
- Updated dependencies [f91a166]
- Updated dependencies [2b41b1a]
- Updated dependencies [7a89580]
- Updated dependencies [6c28e8f]
- Updated dependencies [bf9bb86]
- Updated dependencies [fdcc821]
- Updated dependencies [86c8d56]
- Updated dependencies [f91a166]
- Updated dependencies [2269cce]
- Updated dependencies [4cd7aeb]
- Updated dependencies [88c7d37]
- Updated dependencies [6a0d4d3]
- Updated dependencies [8606fd7]
- Updated dependencies [6cfe3b1]
- Updated dependencies [33b102d]
- Updated dependencies [6a25c70]
- Updated dependencies [a084c3b]
  - @pikku/cli@0.12.187
  - @pikku/addon-changes-cli@0.12.1
  - @pikku/core@0.12.142
