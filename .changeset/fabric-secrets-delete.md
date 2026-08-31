---
'@pikku/cli': patch
---

Add `pikku fabric secrets delete <name>`.

Removing one secret from a stage had no lever. The only thing close was
`secrets rotate`, which retires the stage's sealing key and so takes every
secret on the stage down with it — an enormous blast radius for wanting one
name gone.

`secrets delete` calls the `deleteStageSecret` RPC, which removes the single
named secret and leaves the sealing key and the stage's other secrets alone.
It confirms first unless `--force` is passed: fabric holds only the public half
of the stage keypair, so it cannot read a sealed value back and cannot restore
one — the plaintext has to be supplied again. Deployed units keep serving the
old value until the stage is republished, so the run that does so is reported
when the delete triggers one.
