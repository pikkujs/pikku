//~ name: update-mutation
//~ title: Mutation RPCs (write + RETURNING) — for a SIGNED-IN user
//~ when: A SIGNED-IN user's form or button WRITES to the DB (the client calls usePikkuMutation). If the write must work WITHOUT signing in (a public/anonymous form or webhook) use the public-facing-rpc scaffold instead.
//~ entity: todo
//~ Two files, two DIFFERENT authorization shapes — the second is not decoration. A row
//~ the caller does not own directly (a comment belongs to a todo, and the TODO has the
//~ owner) cannot be scoped with `.where('userId', …)`, and without a real check any
//~ signed-in user can write onto another user's row. That is a cross-tenant write /
//~ IDOR, and it ships silently. Writing both files means the gated shape is present in
//~ the app as code rather than as a warning the agent may or may not have acted on.

//~ steps:
//~ ═══ CLIENT SIDE — every mutation MUST invalidate the queries it affects ═══
//~ A write that doesn't invalidate leaves the UI showing STALE data (the #1 "my app
//~ looks broken" bug). In the component calling this RPC, grab the query client and
//~ invalidate every list/detail query the write changed — pass ONLY the rpc name as
//~ the queryKey. Use mutation.isPending / mutation.error for button + error state,
//~ NEVER hand-managed useState:
//~
//~   const queryClient = useQueryClient()
//~   const mutation = usePikkuMutation('updateTodo', {
//~     onSuccess: () => {
//~       queryClient.invalidateQueries({ queryKey: ['listTodos'] })
//~       // invalidate EVERY query whose data this write changed — add each:
//~       // queryClient.invalidateQueries({ queryKey: ['getTodo'] })
//~     },
//~   })
//~   // <Button loading={mutation.isPending} onClick={() => mutation.mutate({ id, title })}>
//~   // {mutation.error && <Text c="red">{asI18n(mutation.error.message)}</Text>}
//~ No write ships without its invalidation(s).
// ===== FILE: packages/functions/src/functions/update-todo.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
//~ CRITICAL: DB columns come from the GENERATED DB zod (`#pikku/db/zod.gen.js`) —
//~ `<Table>InsertZ` for creates, `<Table>PatchZ` (or `<Table>Z.partial()`) for
//~ edits, `<Table>Z.pick()` for what you return. Re-listing an existing column by
//~ hand is the bug (it drifts). Computed/non-column fields you DO declare yourself
//~ via `.extend()`.
import { TodoZ, TodoPatchZ } from '#pikku/db/zod.gen.js'

//~ PUBLIC write? STOP — use the `public-facing-rpc` scaffold instead. Every pattern here
//~ is pikkuFunc + auth: true, which 403s anonymous callers, so a public/unauthenticated
//~ form wired to one of these silently never submits.

//~ AUTHORIZATION lives in the `permissions` field — NEVER as an `if (!allowed) throw`
//~ inside `func`. Two different things people confuse:
//~   • SCOPING a query to the signed-in user is NOT authorization. Filtering by
//~     `.where('userId', '=', session.userId)` in the query IS the correct way to
//~     read/write the user's OWN rows — keep it in `func` (this file).
//~   • An OWNERSHIP / ROLE gate IS authorization → put it in `permissions` (next file).
//~       - session-only answer (is-signed-in, a role)? → pikkuAuth. This is the default.
//~       - needs a DB lookup or the input (resource ownership)? → pikkuPermission.
//~ `permissions` VALUES ARE pikkuAuth/pikkuPermission OBJECTS, NEVER STRINGS. Writing
//~ `permissions: ['authenticated']` gives `Type 'string' is not assignable to type
//~ 'PikkuPermission'` [TS2769] on the pikkuFunc(...) line. For a plain "must be signed
//~ in", DON'T use permissions at all — set `auth: true`.

//~ THE ROW THE CALLER OWNS → scope in the query, no permission entry needed.
//~ The `id` is a REAL column, so PICK it off the row zod and `.merge()` it with the
//~ editable patch fields — NEVER `.extend({ id: z.string() })`. Hand-writing
//~ `z.string()` for an existing column is the drift the header warns about (and it is
//~ wrong if id is a branded uuid). merge = id (required) + fields (optional):
export const UpdateTodoInput = TodoZ.pick({ id: true }).merge(
  TodoPatchZ.pick({ title: true }).extend({ title: z.string().min(1) }),
)

//~ Output = the columns you return, picked off the generated row zod.
export const UpdateTodoOutput = TodoZ.pick({ id: true, title: true })

export const updateTodo = pikkuFunc({
  expose: true,
  auth: true, //~ no `readonly` here — this mutates
  description: "Update one of the signed-in user's todos.",
  input: UpdateTodoInput,
  output: UpdateTodoOutput,
  func: async ({ kysely }, input, { session }) => {
    //~ Scope writes to session.userId — the `.where` pair is the row AND the guard.
    //~ .returning(...) gets the row back in one round-trip (SQLite/libSQL and Postgres).
    //~ Dates/booleans: the generated db schema type is the source of truth. Default:
    //~ a SQLite date column types as string — write `new Date().toISOString()`. Want
    //~ real Date/boolean types? Declare the kind in db/annotations.ts
    //~ (`todos: { created_at: { kind: 'date' }, done: { kind: 'bool' } }`) before
    //~ pikku-db — the wired coercion plugin then converts storage both ways. Never
    //~ write `new Date()` against a string-typed column or cast around it.
    const row = await kysely
      .updateTable('todo')
      .set({ title: input.title })
      .where('id', '=', input.id)
      .where('userId', '=', session!.userId)
      .returning(['id', 'title'])
      .executeTakeFirstOrThrow()
    return { id: row.id, title: row.title }
  },
})

// ===== FILE: packages/functions/src/functions/add-todo-comment.function.ts =====
import { z } from 'zod'
import { pikkuAuth, pikkuPermission } from '#pikku/auth'
import { pikkuFunc } from '#pikku/function'
import { TodoCommentZ, TodoCommentInsertZ } from '#pikku/db/zod.gen.js'

//~ ⚠️ THIS FILE NEEDS A SECOND TABLE. The file above touches ONE table; this one touches
//~ a CHILD of it, so `<Child>Z`/`<Child>InsertZ` only exist once that child table has a
//~ migration AND `pikku db migrate` has regenerated the zod. Write the file before that and
//~ TypeScript resolves both schemas to `any` and codegen dies with PKU489 naming this
//~ function — the single most common way a build stalls (10 of 20 measured runs, every
//~ one of them an `add<Entity>Comment`). So, in this order: write the child table's
//~ migration in `db/<engine>/*.sql` → `pikku db migrate` → then this file.
//~
//~ AND PICK A CHILD YOU ACTUALLY NEED. The lesson here is INDIRECT OWNERSHIP, not
//~ comments — if this app already has a child row hanging off its main entity (a job's
//~ updates, an order's line items, a booking's notes), point this pattern at THAT and
//~ write no new table at all. A comment feature nobody asked for is a table, a
//~ migration and a screen the brief never wanted.

//~ A comment has no `userId` of its own — it belongs to a todo, and the TODO has the
//~ owner. So it cannot be scoped with `.where('userId', …)`. Without a check, ANY
//~ signed-in user could comment on ANOTHER user's todo. The ownership check needs a DB
//~ lookup, so it is a `pikkuPermission` (not `pikkuAuth`), and it goes in `permissions`.

//~ Session-only checks are pikkuAuth — reach for this FIRST when the answer is in the
//~ session alone. (Here to show the shape; the gate below is on ownership.)
export const isAuthenticated = pikkuAuth(async (_services, session) => !!session)

//~ Data-aware check: does the target todo belong to the caller? `input` is the
//~ function's input; `session` is the 3rd arg.
export const ownsParentTodo = pikkuPermission(
  async ({ kysely }, input: { todoId: string }, { session }) => {
    const todo = await kysely
      .selectFrom('todo')
      .select('userId')
      .where('id', '=', input.todoId)
      .executeTakeFirst()
    return todo?.userId === session?.userId
  },
)

export const AddTodoCommentInput = TodoCommentInsertZ.pick({ todoId: true, body: true }).extend({
  body: z.string().min(1),
})

export const AddTodoCommentOutput = TodoCommentZ.pick({ id: true, todoId: true, body: true })

export const addTodoComment = pikkuFunc({
  expose: true,
  auth: true,
  description: 'Add a comment to a todo the caller owns.',
  input: AddTodoCommentInput,
  output: AddTodoCommentOutput,
  //~ Authorization HERE, before func runs. Groups are OR'd; an array within a group
  //~ is AND'd — e.g. `owner: [isAuthenticated, ownsParentTodo]` requires both.
  permissions: {
    owner: ownsParentTodo,
  },
  //~ By the time func runs, ownership is already proven — no `if (!ok) throw` here.
  func: async ({ kysely }, input) => {
    const row = await kysely
      .insertInto('todoComment')
      .values({ todoId: input.todoId, body: input.body })
      .returning(['id', 'todoId', 'body'])
      .executeTakeFirstOrThrow()
    return { id: row.id, todoId: row.todoId, body: row.body }
  },
})
