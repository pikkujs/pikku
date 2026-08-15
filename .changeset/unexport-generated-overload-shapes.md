---
'@pikku/cli': patch
---

Keep the generated surface to types a user cannot derive

A generated type earns its export in exactly one case: it is reachable from an
exported factory's return type *by name*, so declaration emit in the user's own
module has to name it. Everything else is private — users reach types through
`ReturnType<typeof fn>` or `typeof myValue`, which keeps the factory the single
entry point and keeps the documented surface small.

"By name" is the load-bearing part, and it is narrower than it looks: for an
alias to an object literal or an intersection, TypeScript writes the shape
structurally into the `.d.ts` and never mentions the alias, so being a return
type is not on its own enough. Only `tsc --declaration --emitDeclarationOnly`
can tell the two apart — `--noEmit`, which is what `pikku --tsc` runs, cannot
surface TS2883 at all.

Four kinds of name lose their export:

- **Overload-parameter shapes**, which only name the `config` argument inside an
  overload signature: `PikkuFunctionConfigWithSchema`, `PikkuAuthConfig`,
  `PikkuAuth`, `WiredAuthServices`, `WiredSingletonServices`, `TriggerWiring`,
  `TriggerSource`, `PikkuTriggerFunction`, `PikkuTriggerFunctionConfig`,
  `EmailTemplateVariables`, `RenderEmailInput`, `EnvironmentName`,
  `TypedPersona`, and the workflow/scenario config shapes.
- **Generated id unions** that nothing derives and nothing consumed —
  `PersonaId`, `RunnablePersonaId`, `SecretId`, `VariableId`, `CredentialName`
  and `WorkflowNames` are no longer emitted at all, since an unexported type
  that nothing references is an unused-local error.
- **Raw `@pikku/core` re-exports** that rode along beside a factory:
  `defineScope`, `defineSystemRole`, `defineSecret` and `defineVariable` all
  return `void`, so `CoreScopes`, `CoreScopeNode`, `FlatScope`, `CoreSystemRole`,
  `CoreSystemRoles`, `SystemRole`, `CoreSecret`, `CoreVariable` and the
  `*DefinitionMeta` / `*DefinitionsMeta` metadata shapes were only ever
  parameter types or console internals. The generated files that genuinely need
  them already import them straight from `@pikku/core/ecosystem/*`.
- **Names with no reader at all** — `PikkuListFunction`, referenced by nothing,
  not even `pikkuListFunc`; and `template`, which a graph never reaches for by
  name because the `input` callback is handed it as its second argument,
  `(ref, template) => ...`.

Types imported across generated barrels stay exported — `PikkuFunction`,
`NodeConfig`, `RequiredWireServices` and `SystemRoleName` are each named by a
sibling `.gen.ts`, which is the same declaration-emit constraint one step out.
`pikkuVoidFunc` gains the explicit `PikkuFunctionConfig` return type its sibling
factories already declare.
