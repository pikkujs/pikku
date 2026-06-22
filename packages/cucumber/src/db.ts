import { DatabaseSync } from 'node:sqlite'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface DbUtils {
  buildBaseDb(): string
  freshScenarioDb(): string
  removeScenarioDb(path: string): void
  teardownDb(): void
}

export function createDbUtils(options: {
  migrationsDir: string
  seedFile: string
}): DbUtils {
  let baseDbPath: string | null = null
  let scratchDir: string | null = null

  return {
    buildBaseDb() {
      if (baseDbPath) return baseDbPath
      scratchDir = mkdtempSync(join(tmpdir(), 'function-tests-db-'))
      const base = join(scratchDir, 'base.db')
      const db = new DatabaseSync(base)
      try {
        // migrationsDir/seedFile are optional: a project without a db (or whose
        // engine dir/seed is absent) still gets a usable empty base db rather
        // than crashing on scandir('').
        if (options.migrationsDir && existsSync(options.migrationsDir)) {
          const migrations = readdirSync(options.migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort()
          for (const file of migrations) {
            db.exec(readFileSync(join(options.migrationsDir, file), 'utf8'))
          }
        }
        if (options.seedFile && existsSync(options.seedFile)) {
          db.exec(readFileSync(options.seedFile, 'utf8'))
        }
      } finally {
        db.close()
      }
      baseDbPath = base
      return base
    },

    freshScenarioDb() {
      if (!baseDbPath || !scratchDir) {
        throw new Error('buildBaseDb() must run before freshScenarioDb()')
      }
      const dest = join(scratchDir, `scenario-${process.hrtime.bigint()}.db`)
      copyFileSync(baseDbPath, dest)
      return dest
    },

    removeScenarioDb(path: string) {
      if (!path) return
      rmSync(path, { force: true })
    },

    teardownDb() {
      if (scratchDir) rmSync(scratchDir, { recursive: true, force: true })
      baseDbPath = null
      scratchDir = null
    },
  }
}
