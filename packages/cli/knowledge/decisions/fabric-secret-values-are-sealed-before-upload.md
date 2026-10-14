---
type: decision
title: Fabric secret values are sealed to the stage key before upload
description: pikku fabric secrets set encrypts the value to the stage public key on the local machine, so Fabric stores only ciphertext
tags: cli, fabric, secrets, encryption
---

# Fabric secret values are sealed to the stage key before upload

`pikku fabric secrets set` fetches the stage's public key with `getStageSealingKey`
and seals the plaintext with `seal` before calling `setStageSealedSecret`
(`packages/cli/src/fabric/functions/secrets-set.function.ts:60-67`). The
comment says the private half went to the stage's worker at deploy time and
was dropped there, so only that worker can open the value
(`secrets-set.function.ts:56-59`).

The value comes from `--value` or a prompt. The prompt reads piped stdin when
there is no TTY, so a CI job cannot hang on it (`secrets-set.function.ts:38-45`).

**What this rules out:** Fabric holding plaintext, and a value that the fabric
process itself could decrypt.
