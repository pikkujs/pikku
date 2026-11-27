---
type: question
title: Does a trigger-source row hold only provider identifiers?
description: The trigger-source schema says state holds provider identifiers and that signing secrets go to the credential service, but the store writes whatever state the caller passes as JSON
tags: [kysely, trigger-source, secrets]
---

# Does a trigger-source row hold only provider identifiers?

The doc comment on the table says "`state` holds provider identifiers only: a signing
secret a provider issues goes to the credential service"
(`packages/services/kysely/src/schema/trigger-source.schema.ts:4-7`).

The table has a `state` text column and a `detail` text column
(`trigger-source.schema.ts:26-27`). Nothing in the schema restricts what is written to
them.

The store writes the value it is given. `recordTriggerSource` sets
`state` to `JSON.stringify(result.state)` whenever `result.state` is set
(`packages/services/kysely/src/kysely-trigger-source-store.ts:102-107`). Its test
writes `{ id: 'we_1' }` (`kysely-trigger-source-store.test.ts:41`), which is an
identifier. The test does not check that a secret is refused.

This note did not read the code that builds `result.state`, so it cannot say whether
any caller puts a secret there. The question is whether the comment describes a rule
the code enforces, or only the convention the callers are expected to follow.
