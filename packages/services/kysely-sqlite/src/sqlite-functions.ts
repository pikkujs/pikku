/**
 * User-defined SQL functions, shared between the runtime-specific SQLite
 * drivers so that `functions: { … }` means the same thing whichever one an app
 * is wired to.
 *
 * Only `@pikku/kysely-node-sqlite` can actually register them. bun:sqlite has
 * no equivalent of `db.function()`, so `@pikku/kysely-bun-sqlite` rejects this
 * option outright rather than accepting it and letting the queries fail. That
 * asymmetry is the whole reason this type is declared once, in a package both
 * depend on: an app that names its UDFs against this type finds out at wiring
 * time — or at the type level — that it cannot move to bun, instead of finding
 * out as `no such function: …` from whichever endpoint happens to use it.
 */

/**
 * A scalar SQL function. Arguments arrive as the values SQLite stores — string,
 * number, bigint, Uint8Array or null — and the return value must be one SQLite
 * can store, so no Date, boolean or object.
 */
export type SqliteFunction = (
  ...args: Array<string | number | bigint | Uint8Array | null>
) => string | number | bigint | Uint8Array | null

/** Scalar SQL functions to register, keyed by the name SQL will call them by. */
export type SqliteFunctionMap = Record<string, SqliteFunction>

/**
 * Thrown when UDFs are requested on a runtime that cannot provide them.
 *
 * Its own class rather than a plain Error because the one sensible reaction —
 * fall back to doing the work outside SQL — is worth being able to catch for.
 */
export class SqliteFunctionsUnsupportedError extends Error {
  constructor(
    readonly runtime: string,
    readonly functionNames: string[]
  ) {
    super(
      `${runtime} cannot register user-defined SQL functions, but ${functionNames.length} were requested: ${functionNames.join(', ')}.\n\n` +
        `Every query calling them would fail with "no such function". Options:\n` +
        `  - run on Node with @pikku/kysely-node-sqlite, which supports them; or\n` +
        `  - do the work outside SQL, narrowing rows with an index first so the\n` +
        `    computation runs over a candidate set rather than the whole table.`
    )
    this.name = 'SqliteFunctionsUnsupportedError'
  }
}
