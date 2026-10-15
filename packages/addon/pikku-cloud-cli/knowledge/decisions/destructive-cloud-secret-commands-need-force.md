---
type: decision
title: Destructive Pikku Studio Cloud secret commands refuse to run without --force
description: secrets rotate refuses without --force, and secrets delete refuses without --force when stdin is not a terminal; both say the value cannot be read back
tags: cli, cloud, secrets
---

# Destructive Pikku Studio Cloud secret commands refuse to run without --force

`pikku cloud secrets rotate` is refused unless `force` is set. The refusal
says that every secret on the branch becomes unreadable and must be set again,
because Pikku Studio Cloud cannot re-seal values it cannot open
(`packages/addon/pikku-cloud-cli/src/functions/secrets-rotate.function.ts:43-50`). The
comment before it calls this the one operation in the file that destroys access
to data (`secrets-rotate.function.ts:44-46`). The stage is resolved before the
refusal so the message names the real branch (`secrets-rotate.function.ts:33-35`).

`pikku cloud secrets delete` has two gates. Without `force` and without a TTY
it throws (`packages/addon/pikku-cloud-cli/src/functions/secrets-delete.function.ts:46-51`).
With a TTY it asks for confirmation, and the prompt says the value cannot be
recovered (`secrets-delete.function.ts:52-60`).

**What this rules out:** rotating or deleting a stage's secrets from a script
that has no way to confirm, and a delete that runs silently because stdin is
closed.
