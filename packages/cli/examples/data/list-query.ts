//~ name: list-query
//~ title: List + detail read RPCs (expose + auth + zod + kysely)
//~ when: A page needs to READ rows from the DB. Writes both the list query and the detail-by-id query for the entity.
//~ entity: todo
//~ The example entity is `todo` throughout — table, generated zod, RPC names and file
//~ paths. That consistency is load-bearing now that this is WRITTEN rather than pasted:
//~ `--entity invoice` rewrites every spelling at once, so a scaffold that reached for
//~ the always-present `user` table in one place would land half-renamed and typecheck
//~ against neither table. Keep every domain reference on the one example name.

// ===== FILE: packages/functions/src/functions/list-todos.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
//~ CRITICAL: DB COLUMNS come from the GENERATED DB ZOD — re-listing a field that
//~ EXISTS as a column by hand is the bug (it drifts from the schema). `pikku db`
//~ generates `<Table>Z` (full row), `<Table>InsertZ` (write) and `<Table>PatchZ`
//~ (partial) for EVERY table in `#pikku/db/zod.gen.js`. Compose them: `.pick()` the
//~ columns you return, `.omit()` the ones you don't. Fields that are NOT columns —
//~ computed/aggregated/joined (a count, sum, gap, joined label) — you DO declare
//~ yourself via `.extend()` (or a plain z.object if the whole output is non-DB).
import { TodoZ } from '#pikku/db/zod.gen.js'

//~ Input/output types come ONLY from these zod schemas — never inline generics
//~ (pikkuFunc<In,Out>) and never annotate the func return type. The schema IS
//~ the type and drives the generated client (usePikkuQuery('listTodos', ...)).
export const ListTodosInput = z.object({
  //~ Keep inputs small and validated. Optional search/paging args go here.
  search: z.string().optional(),
})

export const ListTodosOutput = z.object({
  //~ Composed from the generated row zod: pick the returned columns, then extend
  //~ any computed field that is not a DB column.
  //~ NULLABLE columns: a `string | null` column picked here STAYS nullable — that
  //~ is correct. If you hand-write `z.string()` for a nullable column (or omit the
  //~ pick and retype it), the row's `string | null` won't match your required
  //~ `string` and you get `TS2769: No overload matches this call` ON THE func:
  //~ line. That error is a RETURN-vs-output mismatch (usually nullability) — it is
  //~ NOT the query chain, NOT `.orderBy()`, NOT `let query = ...; if (x) query =
  //~ query.where(...)` (all of those type-check fine). Fix the output SCHEMA to
  //~ match the column, never restructure the query.
  todos: z.array(TodoZ.pick({ id: true, title: true })),
})

export const listTodos = pikkuFunc({
  expose: true, //~ generates the typed client RPC consumed by usePikkuQuery
  readonly: true, //~ read-only: declares this never writes
  auth: true, //~ requires a signed-in session (session is non-null below)
  description: 'List todos for the signed-in user.',
  input: ListTodosInput,
  output: ListTodosOutput,
  func: async ({ kysely }, input, { session }) => {
    //~ ALWAYS scope to session.userId — never return another user's rows.
    //~ Use $if for optional filters — one fluent chain, keeps column typing, no
    //~ mutable `let query` reassignment. Reference the typed column, never a raw
    //~ sql`` fragment.
    const rows = await kysely
      .selectFrom('todo')
      .select(['id', 'title'])
      .where('userId', '=', session!.userId)
      .$if(!!input.search, (qb) => qb.where('title', 'like', `%${input.search}%`))
      .execute()
    //~ Rows come back exactly as the generated schema types them: ISO strings by
    //~ default, real Date/boolean if the column kind is declared in
    //~ db/annotations.ts (see the update-mutation scaffold). Match your output
    //~ schema to that type — do not hand-map `r.done === 1` or reparse strings.
    return { todos: rows }
  },
})

// ===== FILE: packages/functions/src/functions/get-todo.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { NotFoundError } from '@pikku/core/errors' //~ typed error → correct 404
import { TodoZ } from '#pikku/db/zod.gen.js'

//~ A detail page (usePikkuQuery('getTodo', { id })) needs a single row. The idiom is
//~ `.executeTakeFirstOrThrow(() => new NotFoundError(...))` — ONE call that returns the
//~ row or throws the TYPED pikku error. Do NOT write `.executeTakeFirst()` then a
//~ separate `if (!row) throw` — that's two steps for what the OrThrow callback does in
//~ one, and a bare `throw new Error()` instead of a typed pikku error becomes an opaque
//~ 500 (see the pikku-errors rule). Scope the WHERE to the tenant (activeOrganizationId
//~ for org apps, else session.userId) so a valid id from ANOTHER org still 404s.
export const GetTodoInput = z.object({ id: z.string() })
export const GetTodoOutput = TodoZ.pick({ id: true, title: true })

export const getTodo = pikkuFunc({
  expose: true,
  readonly: true,
  auth: true,
  description: 'Get one todo by id (scoped to the caller).',
  input: GetTodoInput,
  output: GetTodoOutput,
  func: async ({ kysely }, input, { session }) => {
    //~ selectAll() is fine when output = the full row zod; here we .select the picked
    //~ columns. The two .where clauses = the row AND the tenant guard.
    return await kysely
      .selectFrom('todo')
      .select(['id', 'title'])
      .where('id', '=', input.id)
      .where('userId', '=', session!.userId) //~ swap for `.where('organizationId','=',session!.activeOrganizationId!)` in an org app
      .executeTakeFirstOrThrow(() => new NotFoundError('Todo not found'))
  },
})
