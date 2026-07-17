---
'@pikku/core': patch
---

Add scopes: declared, statically-checked authorization scopes on pikkuFunc.

A scope is a capability string the session must hold. Unlike `permissions` —
which OR together across global/wire/tag/function levels — scopes are an AND
gate that runs before them, so adding one can only ever narrow access.

```ts
wireScope({
  admin: {
    scopes: { invoices: { scopes: { create: {} } } },
  },
})

export const createInvoice = pikkuFunc({
  scopes: ['admin:invoices:create'],
  func: async (services, data) => { ... },
})
```

The gate runs after the auth check and before the request body is evaluated,
since scopes depend only on the session. A session lacking a required scope
gets a `MissingScopeError` (403) naming it. Wildcards grant subtrees:
`admin:*` satisfies `admin` and `admin:invoices:create`.

`session.scopes` is populated by whoever builds the session — core reads it and
never fetches, keeping the runner free of I/O. The new `ScopeService` interface
resolves scopes at the session boundary.
