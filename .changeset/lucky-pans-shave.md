---
'@pikku/cli': patch
---

Point a config-blocked deploy at the command that sets what is actually missing

A deploy blocked on `needs_config` printed one hint — "Set the values with
`pikku fabric secrets set <name>`" — whether what was missing was a secret or a
variable. Secrets and variables are set by two different commands, so anyone
blocked on a variable was sent to a command that refuses their value. The hint
now follows what is missing and names it, so the values can be found without
reading the deployment status by hand.
