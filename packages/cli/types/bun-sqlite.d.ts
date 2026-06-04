declare module 'bun:sqlite' {
  export interface Changes {
    changes: number | bigint
    lastInsertRowid: number | bigint
  }

  export class Statement {
    all(...parameters: unknown[]): unknown[]
    get(...parameters: unknown[]): unknown | null
    iterate(...parameters: unknown[]): IterableIterator<unknown>
    run(...parameters: unknown[]): Changes
  }

  export class Database {
    constructor(filename?: string)
    exec(sql: string): Changes
    prepare(sql: string): Statement
    close(): void
  }
}
