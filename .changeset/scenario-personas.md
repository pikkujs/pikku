---
'@pikku/core': patch
'@pikku/cli': patch
---

Scenario personas — the KIND of person, separate from the body that signs in

`scenarios.actors` conflated two things: who a kind of person is, and which
synthetic user a step runs as. That works until a scenario needs two of the same
kind — tenant isolation, peer sharing, a member hitting another member's row —
at which point the registry grows two near-identical entries and neither says
they are the same kind of person.

`scenarios.personas` now declares the kinds:

```json
"scenarios": {
  "personas": {
    "owner": { "description": "Owns their own entries", "primary": true },
    "viewer": { "description": "Someone the owner shares with", "proficiency": "casual" },
    "reminders": { "description": "The app sending reminders", "kind": "system" }
  }
}
```

A persona carries only what is true of that kind of person for the app's whole
lifetime — `description`, `primary` (whose experience the product is), `kind`
(`person` or `system`), `proficiency` (`casual` or `power`). What someone is
trying to get done, and the circumstances they are doing it in, belong to the
scenario, not to them.

Actors are materialised from personas, so the common case — one body per kind —
needs no `actors` block at all. Declare an actor by hand only for a second body
of one persona:

```json
"actors": { "ownerB": { "persona": "owner", "email": "owner-b@actors.local" } }
```

A `system` persona mints no actor: there is nobody to sign in.

Resolution is shared by codegen and `pikku scenario run` (previously three
independent reads of `config.scenarios.actors`), so the generated
`scenarioActorConfigs` — and therefore the `ScenarioActorName` union that types
`wire.scenarioStep.actor` — always matches the registry a run builds. Two actors
sharing an email is now an error rather than a silently-shared user row, which
is exactly the bug a second body exists to catch.

Fully backwards compatible: an actor with no `persona` resolves as its own
implicit persona, and a project with no `personas` block is untouched.

Because "persona" now names a config entity, actor-flow no longer uses it for
"the actor config the LLM plays": `RunConversationParams.persona`/`personaName`
are now `actor`/`actorName`, and the exported `PersonaLLM` type is `ActorLLM`.
The `'in-persona'` approval policy value is unchanged — it is the English idiom
("stay in character"), not a reference to a declared persona.
