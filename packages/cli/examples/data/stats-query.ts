//~ name: stats-query
//~ title: Dashboard stats RPC (counts/sums/group-by via kysely aggregates)
//~ when: A page shows NUMBERS derived from rows — totals, counts, sums, a breakdown by status/category, an average. Any dashboard/overview/summary card.
//~ entity: item

// ===== FILE: packages/functions/src/functions/get-item-stats.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
//~ Stats OUTPUTS are COMPUTED, not DB columns — so you DECLARE the whole output
//~ zod by hand (a plain z.object of numbers/labels), NOT from the generated row
//~ zod. This is the opposite of list-query: nothing here is a table column.

//~ No input needed for a whole-account summary; add filters (a date range, a
//~ category) here if the screen has them.
export const GetItemStatsInput = z.object({})

//~ Every field is a computed number/label. Keep it flat: the cards read
//~ stats.total, stats.open, stats.byStatus[i].count directly.
export const GetItemStatsOutput = z.object({
  total: z.number(),
  open: z.number(),
  done: z.number(),
  totalValue: z.number(),
  byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
})

export const getItemStats = pikkuFunc({
  expose: true,
  readonly: true,
  auth: true,
  description: 'Summary counts for the signed-in user’s items.',
  input: GetItemStatsInput,
  output: GetItemStatsOutput,
  func: async ({ kysely }, _input, { session }) => {
    //~ PATTERN 1 — MANY aggregates in ONE round-trip. Select several eb.fn
    //~ expressions from the same table; each becomes one column on a single row.
    //~ `count`/`countAll` count rows; `sum` adds a column. WRAP sums in
    //~ coalesce(..., 0) so an empty table returns 0, not null. `filterWhere`
    //~ gives a conditional count (open vs done) WITHOUT a second query.
    //~ Alias every aggregate with `.as('name')` — that name is the result key.
    const totals = await kysely
      .selectFrom('item')
      .where('userId', '=', session!.userId) //~ ALWAYS scope to the session — never global
      .select((eb) => [
        eb.fn.countAll().as('total'),
        eb.fn.count('id').filterWhere('done', '=', 0).as('open'),
        eb.fn.count('id').filterWhere('done', '=', 1).as('done'),
        eb.fn.coalesce(eb.fn.sum('price'), eb.val(0)).as('totalValue'),
      ])
      .executeTakeFirstOrThrow()

    //~ PATTERN 2 — a BREAKDOWN (one row per group) = groupBy + a count. Use this
    //~ for "by status/category/day" lists. `orderBy` a computed alias with `sql`.
    const byStatus = await kysely
      .selectFrom('item')
      .where('userId', '=', session!.userId)
      .select((eb) => ['status', eb.fn.countAll().as('count')])
      .groupBy('status')
      .execute()

    //~ Aggregate results can arrive as strings/bigint depending on driver — coerce
    //~ with Number() so they match the z.number() output (don't return raw).
    return {
      total: Number(totals.total),
      open: Number(totals.open),
      done: Number(totals.done),
      totalValue: Number(totals.totalValue),
      byStatus: byStatus.map((r) => ({ status: String(r.status), count: Number(r.count) })),
    }
  },
})
