---
'@pikku/cli': patch
---

`pikku fabric deploy apply` no longer dies on a transient 5xx, 429 or dropped
connection while it waits on a deployment. The status poll and the approval
call retry with backoff until `--timeout`, so `-y` still approves a plan parked
at the gate instead of leaving it to time out. An approve whose success was
hidden behind a 502 is not re-refused on retry. If the command still gives up
after a deployment was created, it prints the id and the
`deploy apply --deployment-id <id> -y` command to resume.
