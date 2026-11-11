# Functions and schemas

## Functions

Three main function types:

```typescript
// Requires authentication — receives session in wire context.
// input/output are Zod schemas; the data + return types are inferred from them.
const updateTodo = pikkuFunc({
  input: UpdateTodoInput,
  output: TodoOutput,
  func: async (services, data, wire) => {
    const { session } = wire
    return services.todoStore.update(data.id, data)
  },
})

// No authentication required
const listTodos = pikkuSessionlessFunc({
  input: ListTodosInput,
  output: TodoListOutput,
  func: async (services, data) => {
    return { todos: services.todoStore.list(data.filters) }
  },
})

// No input or output (for scheduled tasks, lifecycle hooks)
const cleanup = pikkuVoidFunc(async (services) => {
  services.todoStore.cleanOldItems()
})
```

Services can be destructured inline in the `func` signature (e.g. `async ({ logger, todoStore }, { title }) => ...`). Full config options:

```typescript
pikkuFunc({
  // Identity and documentation — prose, so it follows `metaLocale` in
  // pikku.config.json (default `en`). The identifier does not; see
  // "What Language You Write In".
  title?: string,           // Human-readable name
  description?: string,     // What the function does
  version?: number,         // Contract version (see pikku-meta)
  override?: string,        // Logical name override, so several exports share a versioned base
  tags?: string[],          // For grouping and middleware targeting

  // Contract
  input?: ZodSchema,        // Input validation schema
  output?: ZodSchema,       // Output validation schema
  errors?: Array<typeof PikkuError>,  // Errors this function may throw

  // Reachability
  expose?: boolean,         // Allow external RPC calls (see pikku-wiring)
  remote?: boolean,         // Allow remote RPC calls
  mcp?: boolean,            // Expose as MCP tool (see pikku-wiring)
  readonly?: boolean,       // Declares the function performs no writes
  deploy?: 'serverless' | 'server' | 'auto',

  // Authorization — see pikku-auth
  auth?: boolean,           // Override default auth requirement
  scopes?: ScopeId[],       // AND-ed, checked before permissions; session required
  permissions?: PermissionGroup,  // OR-ed pool
  permissionsInBody?: boolean,    // Last resort; needs allow.permissionsInBody in config
  middleware?: PikkuMiddleware[], // See pikku-middleware

  // Agent tooling — see pikku-agent
  approvalRequired?: boolean,
  approvalDescription?: (services, data) => Promise<string>,

  // Workflow step behavior — see pikku-workflow
  workflowQueued?: boolean, // Dispatch via queue instead of inline
  workflowRetries?: number,
  workflowTimeout?: string, // e.g. '30s', '5m'

  audit?: boolean | { durability?: 'best-effort' | 'transactional' },

  func: async (services, data, wire) => { ... },
})
```

`scopes` is the one option `pikkuSessionlessFunc` does not accept, and the
omission is deliberate: scopes are AND-ed and fail closed, so an anonymous
caller holds none and satisfies none — a sessionless function with scopes would
reject every caller it exists to serve. Gate those with `permissions`, which
receive the optional session and may pass anonymous.

**Generics XOR `input`/`output` — never both.** A function's data and return
types come from _one_ source: either the `input`/`output` schemas (preferred —
they double as runtime validation and OpenAPI) or type generics
(`pikkuFunc<In, Out>({ ... })`). Passing both makes the two disagree and forces
`as any` casts. Do not annotate the `func` return type inline either — let the
`output` schema (or the generic) be the single source of truth for the type.

```typescript
// Correct — schema-based (no generics, no inline return type)
pikkuFunc({ input: MyInput, output: MyOutput, func: async (s, d) => { ... } })
// Correct — generic-based (no input/output)
pikkuFunc<MyIn, MyOut>({ func: async (s, d) => { ... } })
// WRONG — mixing the two
pikkuFunc<MyIn, MyOut>({ input: MyInput as any, func: async (s, d) => { ... } })
```

## Schemas (Validation)

Pikku uses Standard Schema — works with Zod, Valibot, ArkType:

```typescript
import { z } from 'zod'

const CreateTodoInputSchema = z.object({
  title: z.string().min(1).max(200),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string()).optional(),
})
```

Schemas serve triple duty: runtime validation, TypeScript types, and OpenAPI documentation.
