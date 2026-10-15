---
type: decision
title: Pikku Studio Cloud secret values are sealed to the stage key before upload
description: pikku cloud secrets set encrypts the value to the stage public key on the local machine, so Pikku Studio Cloud stores only ciphertext
tags: cli, cloud, secrets, encryption
---

# Pikku Studio Cloud secret values are sealed to the stage key before upload

`pikku cloud secrets set` fetches the stage's public key with `getStageSealingKey`
and seals the plaintext with `seal` before calling `setStageSealedSecret`
(`packages/addon/pikku-cloud-cli/src/functions/secrets-set.function.ts:60-67`). The
comment says the private half went to the stage's worker at deploy time and
was dropped there, so only that worker can open the value
(`secrets-set.function.ts:56-59`).

The value comes from `--value` or a prompt. The prompt reads piped stdin when
there is no TTY, so a CI job cannot hang on it (`secrets-set.function.ts:38-45`).

**What this rules out:** Pikku Studio Cloud holding plaintext, and a value that the cloud
process itself could decrypt.
