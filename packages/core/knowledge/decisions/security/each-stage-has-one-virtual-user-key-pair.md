---
type: decision
title: Each stage has one virtual user key pair, and the app holds only the public half
description: The deployer holds the private key, the app reads the public key from an unreserved variable, and users never see either
tags: services
---

# Each stage has one virtual user key pair, and the app holds only the public half

| Environment | Private key held by | Public key reaches the app as |
| --- | --- | --- |
| `pikku dev` | Generated on first start into `<runtimeDir>/virtual-user/signing.key` (mode 0600, a `.gitignore` of `*` beside it); the CLI reads it there | `process.env.VIRTUAL_USER_VERIFY_KEY`, set before services are built |
| Fabric stage | Fabric's backend, one pair per stage | the stage variable `VIRTUAL_USER_VERIFY_KEY`, set by Fabric |
| Open source deploy | The deployer's machine, as `VIRTUAL_USER_SIGNING_KEY` in the environment of whoever runs the CLI | the variable `VIRTUAL_USER_VERIFY_KEY`, set by the deployer |

The app reads it with `variables.get('VIRTUAL_USER_VERIFY_KEY')`: the SPKI DER, base64
on one line (a PEM is also accepted). A stage without it registers no statement
endpoint, and the CLI's error for that says which variable to set.

**One pair per stage** so a statement for one stage verifies nowhere else; the
audience check is a second line, not the first. **Unreserved names**: neither starts
with `PIKKU_` or `FABRIC_`, which a platform may refuse to let an app or a deployer
set. **Users never manage keys**: `pikku dev` makes them and a deploy supplies them.

**What this rules out:** one key shared across stages, a private key stored in the
app's variables or secrets, and a key a person has to generate or paste to run
scenarios locally.
