import { pikkuSessionlessFunc } from '#pikku/function'
import { sql } from 'kysely'

/** vec0 takes a vector as a JSON array of floats. */
const vector = (embedding: number[]) => JSON.stringify(embedding)

export const addPassage = pikkuSessionlessFunc<
  { id: number; body: string; embedding: number[] },
  { id: number }
>({
  auth: false,
  func: async ({ kysely }, { id, body, embedding }) => {
    await sql`insert into passage (id, body) values (${id}, ${body})`.execute(
      kysely
    )
    // node:sqlite binds every JS number as a REAL, and vec0 refuses a rowid
    // that is not an INTEGER.
    await sql`insert into passage_vector (rowid, embedding) values (cast(${id} as integer), ${vector(embedding)})`.execute(
      kysely
    )
    return { id }
  },
})

export const nearestPassages = pikkuSessionlessFunc<
  { embedding: number[]; k: number },
  { passages: Array<{ body: string; distance: number }> }
>({
  auth: false,
  func: async ({ kysely }, { embedding, k }) => {
    const { rows } = await sql<{ body: string; distance: number }>`
      select passage.body, nearest.distance
      from passage_vector as nearest
      join passage on passage.id = nearest.rowid
      where nearest.embedding match ${vector(embedding)} and k = ${k}
      order by nearest.distance
    `.execute(kysely)
    return { passages: rows }
  },
})
