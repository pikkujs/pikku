import type { TableAnnotations } from '@pikku/core/db'
import { pikkuSchemas } from '@pikku/kysely'
import {
  toColAnnotation,
  type AnnotationMap,
  type RawEntry,
} from './annotation-parser.js'
import { annotationOf } from './table-declaration.js'
import { readMigrationProvenance } from './migration-provenance.js'

/** The label `db generate` gives the migration Better Auth's tables come from. */
const BETTER_AUTH_SOURCE = 'better-auth'
/** The label of the migration that creates `@pikku/kysely`'s runtime tables. */
const RUNTIME_SOURCE = 'pikku-runtime'

/**
 * What Better Auth stores in its four tables, and what that makes each column.
 *
 * Pikku does not declare these tables, Better Auth does, so their annotations
 * live here rather than on a declaration. Keyed by physical name; a column that
 * is not listed is `private`.
 *
 * No column here is `wrapped` or `sealed`. Those make the column encryption
 * plugin decrypt on read and refuse plaintext writes, and Better Auth writes
 * these tables itself, through its own adapter. Where Better Auth encrypts a
 * value (`account.encryptOAuthTokens`) it uses its own key, which Pikku cannot
 * open, so from Pikku's side the column is `plain` either way.
 */
export const BETTER_AUTH_ANNOTATIONS: TableAnnotations = {
  user: {
    email: {
      security: 'pii',
      format: 'email',
      description: "The user's email address.",
    },
  },
  session: {
    // A bearer token: whoever reads the row can act as the user.
    token: {
      security: 'secret',
      form: 'plain',
      description: 'The session bearer token, stored as issued.',
    },
    ip_address: {
      security: 'pii',
      description: 'The address the session was created from.',
    },
  },
  account: {
    // Better Auth hashes a credential password with scrypt.
    password: {
      security: 'secret',
      form: 'hashed',
      description: 'A scrypt hash of the password; never the password.',
    },
    // Stored as the provider issued them. With `account.encryptOAuthTokens`
    // Better Auth encrypts them under its own key, which Pikku cannot open.
    access_token: { security: 'secret', form: 'plain' },
    refresh_token: { security: 'secret', form: 'plain' },
    id_token: { security: 'secret', form: 'plain' },
  },
  verification: {
    // A one-time code or link token, stored as issued.
    value: {
      security: 'secret',
      form: 'plain',
      description: 'A one-time code or link token, stored as issued.',
    },
  },
}

/** The annotations the runtime tables declare on their columns, physical names. */
const runtimeAnnotations = (): TableAnnotations => {
  const annotations: TableAnnotations = {}
  for (const schema of pikkuSchemas) {
    for (const [table, declaration] of Object.entries(schema.tables)) {
      const columns: TableAnnotations[string] = {}
      for (const [column, entry] of Object.entries(declaration.columns)) {
        const annotation = annotationOf(
          entry as unknown as Record<string, unknown>
        )
        if (Object.keys(annotation).length > 0) {
          columns[snakeCase(column)] = annotation
        }
      }
      if (Object.keys(columns).length > 0)
        annotations[snakeCase(table)] = columns
    }
  }
  return annotations
}

const snakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

/**
 * Put the built-in annotations of the framework's own tables under a
 * project's.
 *
 * A built-in applies only to a table a generated migration created for the
 * framework (Better Auth's, or the runtime's), found by the provenance
 * `db generate` stamps on it. A project that wrote its own `user` or `secrets`
 * table is not touched by them. Where a project annotates the same column, its
 * column replaces the built-in one outright: declare a column and it is yours
 * entirely, rather than inheriting half of what the framework assumed.
 */
export function withBuiltinAnnotations(
  project: AnnotationMap,
  migrationsDir: string | undefined
): AnnotationMap {
  if (!migrationsDir) return project
  const provenance = readMigrationProvenance(migrationsDir)
  const merged: AnnotationMap = { ...project }
  const apply = (table: string, builtin: TableAnnotations[string]) => {
    const columns = { ...merged[table] }
    for (const [column, annotation] of Object.entries(builtin)) {
      columns[column] ??= toColAnnotation(annotation as RawEntry)
    }
    merged[table] = columns
  }

  const betterAuth = BETTER_AUTH_ANNOTATIONS
  for (const [table, source] of provenance) {
    if (source.source === BETTER_AUTH_SOURCE && betterAuth[table]) {
      apply(table, betterAuth[table])
    }
  }
  const runtime = runtimeAnnotations()
  for (const [table, source] of provenance) {
    if (source.source === RUNTIME_SOURCE && runtime[table]) {
      apply(table, runtime[table])
    }
  }
  return merged
}
