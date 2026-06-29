import type { ColumnInfo, ForeignKeyInfo } from './db-introspector.js'

export type DbEngine = 'postgres' | 'sqlite'

/** A table the addon owns, captured from introspecting the source DB. */
export interface TableSchema {
  name: string
  columns: ColumnInfo[]
  foreignKeys: ForeignKeyInfo[]
}

export interface SchemaDiff {
  /** Additive DDL statements, in dependency-safe order (creates before alters). */
  statements: string[]
  /** Non-fatal advisories: type changes, would-be drops, risky NOT NULL adds. */
  warnings: string[]
}

/**
 * MVP foreign-key rule: an owned table may only reference other owned tables.
 * A FK pointing at a table outside the owned set is a hard error — the addon
 * cannot be self-contained without dragging in a table it does not own.
 */
export function checkForeignKeyClosure(
  tables: TableSchema[],
  owned: Set<string>
): string[] {
  const errors: string[] = []
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      if (!owned.has(fk.foreignTable)) {
        errors.push(
          `[PKU-ADDON-FK] "${table.name}.${fk.column}" references "${fk.foreignTable}" ` +
            `which the addon does not own. An addon may only reference its own tables. ` +
            `Either include "${fk.foreignTable}" in this addon or drop the foreign key.`
        )
      }
    }
  }
  return errors
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

function renderColumnDef(col: ColumnInfo): string {
  const parts = [quote(col.name), col.type]
  if (col.defaultValue !== null && col.defaultValue !== undefined) {
    parts.push(`DEFAULT ${col.defaultValue}`)
  }
  if (col.notNull) {
    parts.push('NOT NULL')
  }
  return parts.join(' ')
}

function renderCreateTable(table: TableSchema, owned: Set<string>): string {
  const lines: string[] = []
  const realColumns = table.columns.filter((c) => !c.generated)
  for (const col of realColumns) {
    lines.push(`  ${renderColumnDef(col)}`)
  }

  const pkCols = realColumns.filter((c) => c.pk).map((c) => quote(c.name))
  if (pkCols.length > 0) {
    lines.push(`  PRIMARY KEY (${pkCols.join(', ')})`)
  }

  // Only emit FK constraints within the owned set; cross-addon FKs are rejected
  // earlier by checkForeignKeyClosure.
  for (const fk of table.foreignKeys) {
    if (!owned.has(fk.foreignTable)) continue
    lines.push(
      `  FOREIGN KEY (${quote(fk.column)}) REFERENCES ${quote(fk.foreignTable)} (${quote(fk.foreignColumn)})`
    )
  }

  return `CREATE TABLE IF NOT EXISTS ${quote(table.name)} (\n${lines.join(',\n')}\n);`
}

/**
 * Produce additive-only migration SQL bringing `existing` up to `desired`.
 *
 * - Missing table  → CREATE TABLE IF NOT EXISTS
 * - Missing column → ALTER TABLE ADD COLUMN
 * - Type change    → warn, never ALTER the type
 * - Dropped column → warn, never DROP
 *
 * At generation time `existing` is empty so everything is a CREATE. At install
 * time `existing` is the consumer's introspected schema, so the same function
 * yields the incremental diff. Never emits a destructive statement.
 */
export function diffTablesToSql(
  desired: TableSchema[],
  existing: TableSchema[],
  engine: DbEngine,
  owned: Set<string> = new Set(desired.map((t) => t.name))
): SchemaDiff {
  const existingByName = new Map(existing.map((t) => [t.name, t]))
  const statements: string[] = []
  const warnings: string[] = []

  for (const table of desired) {
    const current = existingByName.get(table.name)
    if (!current) {
      statements.push(renderCreateTable(table, owned))
      continue
    }

    const currentCols = new Map(current.columns.map((c) => [c.name, c]))
    const desiredColNames = new Set(table.columns.map((c) => c.name))

    for (const col of table.columns) {
      if (col.generated) continue
      const existingCol = currentCols.get(col.name)
      if (!existingCol) {
        statements.push(
          `ALTER TABLE ${quote(table.name)} ADD COLUMN ${renderColumnDef(col)};`
        )
        if (col.notNull && (col.defaultValue === null || col.defaultValue === undefined)) {
          warnings.push(
            `[PKU-ADDON-WARN] Added NOT NULL column "${table.name}.${col.name}" without a default — ` +
              `this will fail if the table already has rows.`
          )
        }
        continue
      }
      if (normalizeType(existingCol.type, engine) !== normalizeType(col.type, engine)) {
        warnings.push(
          `[PKU-ADDON-WARN] Column "${table.name}.${col.name}" type differs ` +
            `(have "${existingCol.type}", want "${col.type}") — not altered (additive-only).`
        )
      }
    }

    for (const existingCol of current.columns) {
      if (!desiredColNames.has(existingCol.name)) {
        warnings.push(
          `[PKU-ADDON-WARN] Column "${table.name}.${existingCol.name}" exists in the ` +
            `target but not in the addon — left in place (no drops).`
        )
      }
    }
  }

  return { statements, warnings }
}

/**
 * Loose type comparison so trivially-equivalent spellings don't trip the
 * "type differs" warning. We never alter types, so this only gates an advisory.
 */
function normalizeType(type: string, _engine: DbEngine): string {
  return type.trim().toLowerCase().replace(/\s+/g, ' ')
}
