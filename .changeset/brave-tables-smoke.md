---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

Generate a `ScopeId` union from `wireScope` declarations.

`pikku all` now emits `.pikku/scopes/pikku-scopes.gen.ts` with a `ScopeId` union
of every declared scope, plus a wildcard form for each node that has
descendants. A project's generated `pikkuFunc` narrows `scopes` to that union,
so an undeclared scope is a compile error with editor autocomplete:

```ts
wireScope({ name: 'admin', scopes: { invoices: { scopes: { create: {} } } } })

pikkuFunc({
  scopes: ['admin:invoices:create'],  // ✓ autocompleted
  scopes: ['admin:invoice:create'],   // ✗ compile error
  func: ...,
})
```

The inspector independently rejects undeclared scopes, so a cast that defeats
the compiler is still caught at build time.

Also fixes `getArrayPropertyValue` dropping any array behind a cast — idiomatic
`tags: ['a'] as const` was previously invisible to the inspector and silently
omitted from meta.
