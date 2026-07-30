# n8n Code node → Pikku function

Replace a Code-node stub's `throw new Error(...)` body with a faithful TypeScript
reimplementation. The original JS is preserved verbatim in the JSDoc above the
function. Keep the signature and JSDoc intact; only widen the Zod input/output if
the code's data shape demands it.

**Narrow, mechanical translation** — behavioral parity, not better code. Do not
refactor, add error handling, or invent fields.

## Process

1. **Read the file.** Identify the input schema, output schema, the verbatim JS in
   the JSDoc, and the `pikkuSessionlessFunc` shape.
2. **Determine the n8n mode** from the original JSON if available (importer leaves it
   in `fixtures/`, or ask). Two modes:
   - `runOnceForAllItems` (default) — code runs once with `items: Array<{ json, binary, pairedItem }>`, returns an array of envelopes.
   - `runOnceForEachItem` — runs once per item, `$json` / `$input.item.json` in scope, returns a single envelope.
   - If unknown, infer: bare `items.X` → all-items; bare `$json.X` / `$input.item.X` → each-item.
3. **Apply the rubric.**
4. **Edit only the function body.** Leave imports, schemas, JSDoc, name, description, refs untouched unless step 5 forces it.
5. **If the schemas are wrong** (code reads `$json.userId: string` but input is `items: z.array(z.unknown())`), tighten with the smallest change. Prefer `z.unknown()` over `z.any()`. Never widen output to `z.any()`.
6. **Add one comment** at the top of the body noting the mode: `// translated from n8n Code node, mode: runOnceForAllItems`. This is the *only* comment you may add.
7. **Typecheck** (`yarn tsc` from the package root); fix errors with the smallest change.

## Rubric

### Envelope unwrapping — all-items mode

| n8n | Pikku |
|---|---|
| `items` | `(data.items ?? []) as any[]` (or typed if known) |
| `items[i].json.X` | `items[i].X` |
| `items[i].json` | `items[i]` |
| `items[i].binary` | **NOT supported** — leave a TODO and explain |
| `items.length` | `items.length` |
| `items.map(i => i.json.X)` | `items.map((i: any) => i.X)` |

### Envelope unwrapping — each-item mode

| n8n | Pikku |
|---|---|
| `$json.X` / `$input.item.json.X` | `data.X` (input is the item itself) |
| `$input.item.json` | `data` |
| `$input.all()` | not available per-item — change to all-items mode |

### Return statement

| n8n | Pikku |
|---|---|
| `return [{ json: X }]` | `return { items: [X] }` |
| `return items.map(i => ({ json: ... }))` | `return { items: items.map(...) }` |
| `return [{ json: X }, { json: Y }]` | `return { items: [X, Y] }` |
| `return { json: X }` (each-item) | `return X` |
| `return [...]` (already plain) | wrap in `{ items: [...] }` only if the output schema expects it |

### Built-ins — do NOT auto-translate

If the code references any of these, **stop**, leave the body a stub, and annotate
`// TODO:` + explain:

- `this.helpers.*` (binary buffers, HTTP requests, prepareBinaryData)
- `$node['Some Node'].json` (cross-node refs — resolve via Pikku `ref()` upstream, not in the body)
- `$workflow`, `$execution`, `$item()`, `$items('Other Node')`
- `getBinaryDataBuffer` / `getStaticData` — no equivalent, TODO
- `require()` / dynamic `import()` — flag and stop

Translate these only when reachable: `$now`/`$today` → `new Date()`; `$env.X` →
`services.variables.get('X')` (never `process.env` — Pikku house rule; `services` is
the first param).

### Async / types

- Original uses `await` → the body is already `async`; keep every `await`.
- `this.helpers.httpRequest(...)` → do NOT inline; the user should use a separate
  `httpRequest` rpc node. Leave a `// TODO:` and explain.
- Cast `items` as `any[]` only if the schema is `z.array(z.unknown())`; use the
  inferred type if tightened. Never `as any` on the return — fix the schema instead.

## Example

Before (stub):
```ts
/**
 * STUB — generated from n8n Code node "Custom Code".
 *   const total = items.reduce((acc, i) => acc + i.json.amount, 0);
 *   return [{ json: { total } }];
 */
export const codeStubCustomCode = pikkuSessionlessFunc({
  input: CodeStubCustomCodeInput,
  output: CodeStubCustomCodeOutput,
  func: async (_services, _data) => {
    throw new Error('Stub: ported from n8n Code node "Custom Code" — implement me')
  },
})
```

After:
```ts
export const codeStubCustomCode = pikkuSessionlessFunc({
  description: 'Ported from n8n Code node "Custom Code"',
  input: CodeStubCustomCodeInput,
  output: CodeStubCustomCodeOutput,
  func: async (_services, data) => {
    // translated from n8n Code node, mode: runOnceForAllItems
    const items = (data.items ?? []) as any[]
    const total = items.reduce((acc, i) => acc + i.amount, 0)
    return { items: [{ total }] }
  },
})
```

## Report

Terse: the mode you inferred (one sentence), the literal rubric translations
applied, anything flagged TODO and why, any schema tightening (before → after).

Do not add tests, refactor, edit other files, "improve" the logic, or add
try/catch unless the original did. If the code is empty, comment-only, or so
dependent on n8n internals that no honest translation is possible, leave the stub
and tell the user which n8n features block it.
