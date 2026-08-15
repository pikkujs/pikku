---
'@pikku/cli': patch
---

Keep the generated surface to types a user cannot derive

A generated type earns its export in exactly one case: it is reachable from an
exported factory's return type, so declaration emit in the user's own module has
to name it. Everything else is private — users reach types through
`ReturnType<typeof fn>` or `typeof myValue`, which keeps the factory the single
entry point and keeps the documented surface small.

Three kinds of name lose their export:

- **Overload-parameter shapes**, which only name the `config` argument inside an
  overload signature: `PikkuFunctionConfigWithSchema`, `PikkuAuthConfig`,
  `PikkuAuth`, `WiredAuthServices`, `TriggerWiring`, `TriggerSource`,
  `PikkuTriggerFunction`, `EmailTemplateVariables`, `RenderEmailInput`,
  `EnvironmentName`, `TypedPersona`, and the workflow/scenario config shapes.
- **Generated id unions** that nothing derives and nothing consumed —
  `PersonaId`, `RunnablePersonaId`, `SecretId`, `VariableId`, `CredentialName`
  and `WorkflowNames` are no longer emitted at all, since an unexported type
  that nothing references is an unused-local error.
- **`PikkuListFunction`**, which was referenced by nothing, not even
  `pikkuListFunc` — the factory takes `PikkuFunctionConfig<ListInput, ListOutput>`
  directly, so the union was also the wrong shape to annotate anything with.

Two exports are restored or kept because declaration emit needs them:
`PikkuTriggerFunctionConfig` is the declared return type of both
`pikkuTriggerFunc` overloads, and `pikkuVoidFunc` gains the explicit
`PikkuFunctionConfig` return type its sibling factories already declare. Types
imported across generated barrels — `NodeConfig`, `RequiredWireServices`,
`SystemRoleName` — stay exported for the same reason.
