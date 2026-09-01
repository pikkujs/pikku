# Pikku React Query Hooks


## Discover what's available on the client

Before writing a hook, get the full client surface in one call:

```bash
yarn pikku meta clients --json
```

Returns RPCs, workflows, and channels with descriptions and type names:

```json
{
  "rpcs": [
    { "name": "createTodo", "description": "Create a todo",
      "readonly": false, "input": "CreateTodoInput", "output": "CreateTodoOutput" },
    { "name": "listTodos", "description": "List all todos",
      "readonly": true,  "input": null,              "output": "ListTodosOutput" }
  ],
  "workflows": [...],
  "channels": [...]
}
```

The `name` is the RPC identifier; pass it to the hooks below. Input/output
shapes are inferred automatically — the hook is typed against
`FlattenedRPCMap[name]['input' | 'output']`. Use `description` to pick the
right RPC; use `readonly` to choose `usePikkuQuery` vs `usePikkuMutation`.

## Setup (once per app)

In your app entry (e.g. `main.tsx`):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PikkuProvider, createPikku } from '@pikku/react'
import { PikkuFetch } from './pikku/pikku-fetch.gen'
import { PikkuRPC } from './pikku/pikku-rpc.gen'

import { apiUrl } from './lib/env'

const queryClient = new QueryClient()
const pikku = createPikku(PikkuFetch, PikkuRPC, {
  serverUrl: apiUrl(),
})

<QueryClientProvider client={queryClient}>
  <PikkuProvider pikku={pikku}>
    <App />
  </PikkuProvider>
</QueryClientProvider>
```

The two generated files come from `pikku.config.json`'s
`clientFiles.fetchFile` and `clientFiles.rpcWiringsFile`. Hooks live in
the file at `clientFiles.reactQueryFile` (typically `api.gen.ts`).

`apiUrl()` is the shared server-URL helper — see `references/client.md`. Never
inline `?? 'http://localhost:3000'`: a deploy that supplies the URL as a
runtime binding leaves `import.meta.env.VITE_API_URL` undefined in the
bundle, so the fallback is the branch that actually runs.

## TanStack Start (SSR)

Under Start the provider mounts in `routes/__root.tsx` rather than
`main.tsx`, and the same module is evaluated on the server. Three things
differ:

1. **`apiUrl()` must have an SSR branch.** `window` is undefined during
   render; return the build-time var or a placeholder (the client hooks
   only fire in the browser).
2. **Build auth clients lazily.** Better Auth validates its baseURL with
   `new URL(...)` at construction, so a module-scope `createAuthClient`
   crashes SSR on the placeholder. Memoize it behind a getter:

   ```ts
   let _authClient: ReturnType<typeof createAuthClient> | undefined
   export const authClient = () =>
     (_authClient ??= createAuthClient({ baseURL: `${apiUrl()}/auth` }))
   ```

3. **The auth baseURL needs the `/auth` suffix.** Better Auth only
   appends its default `/api/auth` when the baseURL carries no path.
   `apiUrl()` already ends in `/api`, so a bare `apiUrl()` leaves the
   client calling `/api/get-session` and 404ing.

Server functions that need typed RPC access use the generated shim:

```bash
pikku tanstack-start   # emits the makeApi server-function shim
```

## The hooks

All hooks are imported from your generated `api.gen.ts`:

```tsx
import {
  usePikkuQuery,
  usePikkuMutation,
  usePikkuInfiniteQuery,
} from './pikku/api.gen'
```

### `usePikkuQuery(name, data, options?)`

For RPCs that **read** data. Cacheable. The hook is typed against the RPC's
input + output.

```tsx
export function TodoList() {
  const { data, isLoading, error } = usePikkuQuery('listTodos', {})

  if (isLoading) return <p>Loading…</p>
  if (error) return <p>{error.message}</p>
  return (
    <ul>
      {data?.todos.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  )
}
```

The query key is `[name, data]` automatically — no manual key wrangling.
Pass standard `useQuery` options through (`staleTime`, `enabled`, etc.).

### `usePikkuMutation(name, options?)`

For RPCs that **write**. Returns a React Query mutation object.

```tsx
export function CreateTodoForm() {
  const queryClient = useQueryClient()
  const mutation = usePikkuMutation('createTodo', {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['listTodos'] }),
  })

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const title = (
      e.currentTarget.elements.namedItem('title') as HTMLInputElement
    ).value
    mutation.mutate({ title })
  }

  return (
    <form onSubmit={onSubmit}>
      <input name="title" />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}
```

The input passed to `mutation.mutate(...)` is type-checked against the RPC's
input schema. After success, **invalidate** any list/get queries that should
refetch.

### `usePikkuInfiniteQuery(name, data, options?)`

The hook's `name` parameter is narrowed to RPCs whose **output** has a
`nextCursor?: string | null` field, so calling it with anything else is a type
error rather than a missing hook. That output field is read after each page and
sent back as the **input** field `cursor` — which is why the `data` you pass is
`Omit<input, 'cursor'>`: the hook owns that key.

```tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
  usePikkuInfiniteQuery('listTodos', { limit: 20 })

const todos = data?.pages.flatMap((p) => p.todos) ?? []
```

So the backend contract is a pair: output `nextCursor`, input `cursor`. An RPC
missing either one paginates with `usePikkuQuery` and manual cursor state
instead.

## Workflow hooks

When the project defines any workflow, the same file also gains
`useStartWorkflow(name)` (mutation → `{ runId }`), `useRunWorkflow(name)`
(mutation → the workflow's output) and `useWorkflowStatus(name, runId?)` (query,
disabled until `runId` is set). See `references/workflows.md`.

## Calling RPCs without React Query

For one-off calls (event handlers outside of state, side effects), use
`usePikkuRPC()` from `@pikku/react`:

```tsx
const rpc = usePikkuRPC()
const handleClick = async () => {
  const result = await rpc.invoke('createTodo', { title: 'inline' })
}
```

But prefer the React Query hooks for anything that touches render state —
caching, retries, dedup, and dev-tools come for free.

## Common patterns

- **Optimistic updates**: pass `onMutate` to `usePikkuMutation` to update
  the cache before the server responds. Standard React Query pattern;
  Pikku doesn't add anything special.
- **Conditional fetching**: pass `enabled: !!someValue` to skip a query
  until you have the input.
- **Refetch on focus**: enabled by default in React Query; disable with
  `refetchOnWindowFocus: false` in options.

## What NOT to do

- Don't import the RPC client directly and call it inside `useEffect` —
  use the hooks. They handle dedup, caching, and unmount safely.
- Don't hand-write `useQuery({ queryKey: ['listTodos'], queryFn: ... })`
  — `usePikkuQuery('listTodos', {})` does it correctly with one line.
- Don't construct hook names dynamically. Hook names = RPC names known at
  generation time.
- Don't bypass the type system with `as any` — if a hook's types don't
  match what you expect, the backend's input/output schemas are wrong;
  fix those first.
