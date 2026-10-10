# Scopes

Scopes answer "what was this session granted?" before permissions ask "may this user do
this to this resource?". They are AND-ed: every scope listed must be held. Because they
are checked first and fail closed, a scope can only ever narrow access.

## Declaring the tree

Declare the scope tree once with `defineScope`. The body is a no-op that tree-shakes
away; the CLI reads the call by AST and generates a `ScopeId` union, so a function naming
an undeclared scope fails the build.

```typescript
// src/scopes.ts
import { defineScope } from '#pikku/scopes'

defineScope({
  admin: {
    displayName: 'Administration',
    description: 'Administrative access',
    scopes: {
      invoices: {
        description: 'Invoice management',
        scopes: {
          create: { description: 'Create invoices' },
          void: { description: 'Void invoices' },
        },
      },
    },
  },
  billing: {},
})
```

Every node is grantable, keyed by segment: the above yields `admin`, `admin:invoices`,
`admin:invoices:create`, `admin:invoices:void` and `billing`. Scopes may be declared
across more than one file; the declarations merge.

## Using them

```typescript
export const voidInvoice = pikkuFunc({
  scopes: ['admin:invoices:void'],
  permissions: { owner: isInvoiceOwner },
  func: async ({ kysely }, { invoiceId }) => { ... },
})
```

A grant satisfies a required scope if it is the scope itself, an ancestor of it, or a
wildcard at any level: a session holding `admin` satisfies `admin:invoices:void`, and so
does `admin:*`. A missing scope throws `MissingScopeError` naming the first one that
failed.

## Not on sessionless functions

`scopes` requires a session and is unavailable on `pikkuSessionlessFunc`: scopes fail
closed, an anonymous caller holds none, and a sessionless function with scopes would
reject every caller it exists to serve. Gate those with `permissions`, which receive the
optional session and may pass anonymous.
