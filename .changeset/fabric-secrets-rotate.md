---
'@pikku/cli': patch
---

`pikku fabric secrets rotate` retires a stage's sealing key so the next deploy issues a new one. This is the way out of the one dead end in client-side sealing: a worker that does not hold the stage's private key cannot read that stage's secrets, and fabric cannot hand it the key because fabric keeps no copy. Rotating makes every secret already set on the stage unreadable — fabric cannot re-seal values it cannot open — so it requires `--force` and says exactly that first.
