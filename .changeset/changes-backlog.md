---
'@pikku/addon-changes-cli': patch
'@pikku/addon-cloud-cli': patch
---

`pikku changes` is a board. Each change has one status, its column: backlog, ready, in progress, needs answer, done. `start <id...>` moves a ready change to in progress, `backlog <id...>` shelves it and `ready <id...>` brings it back; `file --backlog` files straight into the backlog. A claim lives on the changeset's lease, not on the change, so a change left in progress after its lease lapses is picked up again by `next`. `claim`, `wait` and `next` skip the backlog. `ask` and `shot` park a change as needs answer and record whether it needs a question or a visual answer. `list` shows the columns with counts and badges for claimed and abandoned work. Stores written by older versions are migrated on read.
