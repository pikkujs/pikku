---
'@pikku/cli': patch
---

`fabric deploy apply` reports the commit the deployment holds, not the one requested

With a deployment already parked at `suspended` for the branch,
`deployByStageKind` attaches to that plan — pinned to whatever commit it was
cut at — rather than creating a new one. The CLI echoed back the sha it had
been asked for, so `apply` printed

```
status: suspended   sha: 599439e6
```

for a deployment `deploy list` showed pinned to `5bfe84c`, five commits above
it. `--ref` did not help; the argument was echoed too. The only symptom was a
correct-looking line of output, and the failure mode is a rollback that
silently does not roll back.

The ref is now read back off the deployment, and a disagreement between what
was asked for and what is held aborts with both shas and the deployment id
named, rather than continuing under the wrong one.
