/**
 * The functions of a project's CMS, written into the project. They are plain
 * Pikku functions over the app's own Kysely, so its scopes, permissions,
 * validation and `--security` lint apply to them as to any other.
 */
import type { CmsOperation } from '@pikku/core/cms'
import type {
  CmsCheck,
  CmsModel,
  CmsModelCollection,
} from './cms-model.types.js'
import { valueKind } from './cms-columns.js'
import { isServerFilledKey, stampedColumn } from './build-cms-model.js'
import { describeCmsModel } from './cms-description.js'
import {
  DESCRIBE_FUNCTION,
  createFunction,
  deleteFunction,
  getFunction,
  listFunction,
  pascal,
  updateFunction,
} from './cms-names.js'
import { rowType, schemaName } from './serialize-cms-schemas.js'

export interface CmsImportPaths {
  functionLeaf: string
  authLeaf: string
  errorLeaf: string
  schemas: string
  runtime: string
  /** The path the generated file imports an app check's module by. */
  checkModule: (module: string) => string
}

const OPERATIONS: CmsOperation[] = ['create', 'edit', 'delete']

/** One import for every app check, however many collections name it. */
const checkImports = (model: CmsModel, paths: CmsImportPaths) => {
  const aliases = new Map<string, string>()
  const lines: string[] = []
  const alias = ({ module, exportName }: CmsCheck) => {
    const key = `${module}#${exportName}`
    let name = aliases.get(key)
    if (!name) {
      name = `appCheck${aliases.size}`
      aliases.set(key, name)
      lines.push(
        `import { ${exportName} as ${name} } from '${paths.checkModule(module)}'`
      )
    }
    return name
  }
  for (const collection of model.collections) {
    for (const check of Object.values(collection.checks)) alias(check)
  }
  return { lines, alias }
}

type Alias = (check: CmsCheck) => string

const holder = (collection: string, operation: CmsOperation) =>
  `holdsCms${pascal(collection)}${pascal(operation)}`

/** A permission that reads the caller's grants again and wants these. */
const holds = (collection: string, operation: CmsOperation) => {
  const scopes = [...new Set(['read', operation])]
    .map((op) => `'cms:${collection}:${op}'`)
    .join(', ')
  return `const ${holder(collection, operation)} = pikkuAuth(async ({ scopeService }, session) =>
  cmsHolds([${scopes}], { scopeService }, session)
)`
}

/**
 * The scopes and the checks of one operation, all of which must pass. A write
 * asks for its grants a second time, read now: a session cache may still hold
 * one that has been revoked.
 */
export const guards = (
  collection: CmsModelCollection,
  operation: CmsOperation,
  alias: Alias
): string => {
  const { name, checks } = collection
  const scopes = [...new Set(['read' as const, operation])].map(
    (op) => `'cms:${name}:${op}'`
  )
  const required = [
    ...(operation === 'read' ? [] : [holder(name, operation)]),
    ...[...new Set(['read' as const, operation])].flatMap((op) =>
      checks[op] ? [alias(checks[op]!)] : []
    ),
  ]
  return [
    `  scopes: [${scopes.join(', ')}],`,
    // One group: the entries of a group all have to pass.
    ...(required.length
      ? [`  permissions: { cms: [${required.join(', ')}] },`]
      : []),
  ].join('\n')
}

export const upperSnake = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

const kinds = (collection: CmsModelCollection, columns: string[]) =>
  `{ ${columns.map((c) => `${c}: '${valueKind(collection.columns[c]!)}'`).join(', ')} } as const`

const isTime = (collection: CmsModelCollection, column: string) =>
  valueKind(collection.columns[column]!) === 'datetime'

const plainColumns = (collection: CmsModelCollection, columns: string[]) =>
  columns.filter((column) => !isTime(collection, column))

/** The selects that read each timestamp as text. */
const timeSelects = (collection: CmsModelCollection, columns: string[]) =>
  columns
    .filter((column) => isTime(collection, column))
    .map((column) => `.select(cmsText('${column}'))`)
    .join('')

const constants = (collection: CmsModelCollection): string => {
  const prefix = upperSnake(collection.name)
  const { listColumns, readColumns, list } = collection
  return [
    `const ${prefix}_LIST_COLUMNS = ${JSON.stringify(plainColumns(collection, listColumns))} as const`,
    `const ${prefix}_LIST_KINDS = ${kinds(collection, listColumns)}`,
    `const ${prefix}_COLUMNS = ${JSON.stringify(plainColumns(collection, readColumns))} as const`,
    `const ${prefix}_KINDS = ${kinds(collection, readColumns)}`,
    ...(list.filter.length
      ? [`const ${prefix}_FILTER_KINDS = ${kinds(collection, list.filter)}`]
      : []),
  ].join('\n')
}

const listSource = (collection: CmsModelCollection, alias: Alias): string => {
  const { name, label, list, primaryKey } = collection
  const prefix = upperSnake(name)
  const row = `z.infer<typeof ${rowType(name, 'ListRow')}>`
  const body = [
    `    const { limit, offset } = cmsPage(input)`,
    `    let query = kysely.selectFrom('${name}').select(${prefix}_LIST_COLUMNS)${timeSelects(collection, collection.listColumns)}`,
    ...(list.filter.length
      ? [
          `    for (const { column, operator, value } of cmsConditions(input.filter, ${prefix}_FILTER_KINDS)) {
      query = query.where(sql.ref(column), CMS_SQL_OPERATORS[operator], value)
    }`,
        ]
      : []),
    ...(list.search.length
      ? [
          `    if (input.search) {
      const pattern = cmsSearchPattern(input.search)
      query = query.where((eb) =>
        eb.or([
${list.search
  .map(
    (column) =>
      `          sql<boolean>\`lower(\${sql.ref('${column}')}) like lower(\${pattern}) escape '!'\`,`
  )
  .join('\n')}
        ])
      )
    }`,
        ]
      : []),
    ...(list.sort.length
      ? [
          `    for (const { column, direction } of input.sort ?? []) {
      query = query.orderBy(sql.ref(column), direction)
    }`,
        ]
      : []),
    // The key last, so rows that sort alike keep their place between pages.
    `    const rows = await query
      .orderBy('${primaryKey}', 'asc')
      .limit(limit + 1)
      .offset(offset)
      .execute()
    return {
      rows: rows
        .slice(0, limit)
        .map((row) => toCmsRow<${row}>(row, ${prefix}_LIST_KINDS)),
      nextCursor: rows.length > limit ? String(offset + limit) : null,
    }`,
  ]
  const fn = listFunction(name)
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: list ${label}`)},
  expose: true,
  readonly: true,
${guards(collection, 'read', alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely }, input) => {
${body.join('\n')}
  },
})`
}

/** The read of one record that follows a write, and answers a get. */
const selectRecord = (collection: CmsModelCollection, id: string) => {
  const { name, primaryKey } = collection
  return `await kysely
      .selectFrom('${name}')
      .select(${upperSnake(name)}_COLUMNS)${timeSelects(collection, collection.readColumns)}
      .where('${primaryKey}', '=', ${id})
      .executeTakeFirst()`
}

const answerRecord = (collection: CmsModelCollection) =>
  `    if (!row) throw new NotFoundError('There is no record with that id')
    return {
      row: toCmsRow<z.infer<typeof ${rowType(collection.name, 'Record')}>>(row, ${upperSnake(collection.name)}_KINDS),
    }`

/** One column of an insert or an update, taken from the caller key by key. */
const assignment = (
  collection: CmsModelCollection,
  column: string,
  from: string
) =>
  collection.columns[column]!.family === 'timestamp'
    ? `${column}: cmsStoredDatetime(${from}.${column}),`
    : `${column}: ${from}.${column},`

const mutation = (
  collection: CmsModelCollection,
  operation: 'create' | 'edit' | 'delete',
  fn: string,
  description: string,
  params: string,
  body: string,
  alias: Alias
) => `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: ${description} ${collection.label}`)},
  expose: true,
  audit: true,
${guards(collection, operation, alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely, auditLog }, ${params}) => {
${body}
  },
})`

const createSource = (collection: CmsModelCollection, alias: Alias): string => {
  const { name, primaryKey, columns, fields } = collection
  const keyed = isServerFilledKey(columns[primaryKey]!)
  const version = stampedColumn(collection)
  const values = [
    ...(keyed ? [`${primaryKey}: id,`] : []),
    ...fields.map((field) => assignment(collection, field.name, 'values')),
    ...(version && !version.hasDefault
      ? [`${version.name}: new Date().toISOString(),`]
      : []),
  ]
    .map((line) => `          ${line}`)
    .join('\n')
  const insert = `kysely
        .insertInto('${name}')
        .values({
${values}
        })`
  const body = keyed
    ? `    const id = crypto.randomUUID()
    await cmsWrite('create', () =>
      ${insert}
        .execute()
    )`
    : `    const { ${primaryKey}: id } = await cmsWrite('create', () =>
      ${insert}
        .returning('${primaryKey}')
        .executeTakeFirstOrThrow()
    )`
  return mutation(
    collection,
    'create',
    createFunction(name),
    'create a record of',
    '{ values }',
    `${body}
    await cmsAudit(auditLog, 'created', '${name}', id, Object.keys(values))
    const row = ${selectRecord(collection, 'id')}
${answerRecord(collection)}`,
    alias
  )
}

const updateSource = (collection: CmsModelCollection, alias: Alias): string => {
  const { name, primaryKey, fields } = collection
  const version = stampedColumn(collection)
  const set = [
    ...fields.map((field) => assignment(collection, field.name, 'patch')),
    ...(version && !version.hasOnUpdate
      ? [`${version.name}: new Date().toISOString(),`]
      : []),
  ]
    .map((line) => `        ${line}`)
    .join('\n')
  const read = version
    ? `    const current = await kysely
      .selectFrom('${name}')
      // As the database writes it, which is what the update compares again.
      .select(sql<string | null>\`cast(\${sql.ref('${version.name}')} as text)\`.as('storedVersion'))
      .where('${primaryKey}', '=', id)
      .executeTakeFirst()
    if (!current) throw new NotFoundError('There is no record with that id')
    if (
      expectedUpdatedAt !== undefined &&
      cmsStoredValue(current.storedVersion, '${valueKind(version)}') !== expectedUpdatedAt
    ) {
      throw new ConflictError('The record has changed since it was read')
    }
`
    : ''
  const unchanged = version
    ? `    if (expectedUpdatedAt !== undefined) {
      // In the update itself, so a write between the two cannot be lost.
      query = query.where(
        sql<string | null>\`cast(\${sql.ref('${version.name}')} as text)\`,
        current.storedVersion === null ? 'is' : '=',
        current.storedVersion
      )
    }
`
    : ''
  return mutation(
    collection,
    'edit',
    updateFunction(name),
    'change a record of',
    version ? '{ id, patch, expectedUpdatedAt }' : '{ id, patch }',
    `    const changed = cmsChanged(patch)
${read}    let query = kysely
      .updateTable('${name}')
      .set({
${set}
      })
      .where('${primaryKey}', '=', id)
${unchanged}    const { numUpdatedRows } = await cmsWrite('update', () =>
      query.executeTakeFirstOrThrow()
    )
    if (!numUpdatedRows) {
${
  version
    ? `      if (expectedUpdatedAt !== undefined) {
        throw new ConflictError('The record has changed since it was read')
      }
`
    : ''
}      throw new NotFoundError('There is no record with that id')
    }
    await cmsAudit(auditLog, 'updated', '${name}', id, changed)
    const row = ${selectRecord(collection, 'id')}
${answerRecord(collection)}`,
    alias
  )
}

const deleteSource = (collection: CmsModelCollection, alias: Alias): string => {
  const { name, primaryKey } = collection
  return mutation(
    collection,
    'delete',
    deleteFunction(name),
    'delete a record of',
    '{ id }',
    `    const { numDeletedRows } = await cmsWrite('delete', () =>
      kysely
        .deleteFrom('${name}')
        .where('${primaryKey}', '=', id)
        .executeTakeFirstOrThrow()
    )
    if (!numDeletedRows) {
      throw new NotFoundError('There is no record with that id')
    }
    await cmsAudit(auditLog, 'deleted', '${name}', id)
    return { removed: true }`,
    alias
  )
}

const getSource = (collection: CmsModelCollection, alias: Alias): string => {
  const { name, label } = collection
  const fn = getFunction(name)
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: one record of ${label}`)},
  expose: true,
  readonly: true,
${guards(collection, 'read', alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely }, { id }) => {
    const row = ${selectRecord(collection, 'id')}
${answerRecord(collection)}
  },
})`
}

const describeSource = (model: CmsModel, alias: Alias): string => {
  const descriptions = describeCmsModel(model)
  const entries = model.collections.map((collection, index) => {
    const checks = (['read', ...OPERATIONS] as CmsOperation[]).flatMap((op) =>
      collection.checks[op] ? [`${op}: ${alias(collection.checks[op]!)}`] : []
    )
    return `  {
    description: ${JSON.stringify(descriptions[index], null, 2).replace(/\n/g, '\n    ')},
    checks: { ${checks.join(', ')} },
  },`
  })
  // A group each, and any one group is enough. The app's read check sits in the
  // group itself, where the inspector sees which services it needs.
  const groups = model.collections.map((collection) => {
    const group = [
      holder(collection.name, 'read'),
      ...(collection.checks.read ? [alias(collection.checks.read)] : []),
    ]
    return `    ${collection.name}: [${group.join(', ')}],`
  })
  return `const CMS_COLLECTIONS: CmsDescribedCollection[] = [
${entries.join('\n')}
]

export const ${DESCRIBE_FUNCTION} = pikkuFunc({
  description: 'CMS: the collections this caller may use, and how to show them',
  expose: true,
  readonly: true,
  permissions: {
${groups.join('\n')}
  },
  input: DescribeCmsInput,
  output: DescribeCmsOutput,
  func: async (services, _data, { session }) =>
    cmsDescribe(CMS_COLLECTIONS, services, session),
})`
}

/** What a collection gets besides `describeCms`. */
const collectionSource = (
  collection: CmsModelCollection,
  alias: Alias
): string =>
  [
    constants(collection),
    holds(collection.name, 'read'),
    ...(['create', 'edit', 'delete'] as const)
      .filter((operation) => collection[operation])
      .map((operation) => holds(collection.name, operation)),
    listSource(collection, alias),
    getSource(collection, alias),
    ...(collection.create ? [createSource(collection, alias)] : []),
    ...(collection.edit ? [updateSource(collection, alias)] : []),
    ...(collection.delete ? [deleteSource(collection, alias)] : []),
  ].join('\n\n')

const imports = (names: string[], from: string, source: string, type = '') => {
  const used = names.filter((name) => new RegExp(`\\b${name}\\b`).test(source))
  return used.length
    ? `import ${type}{ ${used.join(', ')} } from '${from}'\n`
    : ''
}

export const serializeCmsFunctions = (
  model: CmsModel,
  paths: CmsImportPaths,
  schemaNames: string[]
): string => {
  const { lines, alias } = checkImports(model, paths)
  const source = [
    ...model.collections.map((c) => collectionSource(c, alias)),
    describeSource(model, alias),
  ].join('\n\n')
  return [
    imports(['sql'], 'kysely', source),
    imports(['z'], 'zod', source, 'type '),
    imports(['pikkuFunc'], paths.functionLeaf, source),
    imports(['pikkuAuth'], paths.authLeaf, source),
    imports(
      [
        'ConflictError',
        'ForbiddenError',
        'NotFoundError',
        'UnprocessableContentError',
      ],
      paths.errorLeaf,
      source
    ),
    imports(
      [
        'CMS_SQL_OPERATORS',
        'cmsAudit',
        'cmsChanged',
        'cmsConditions',
        'cmsDatetime',
        'cmsDescribe',
        'cmsHolds',
        'cmsPage',
        'cmsSearchPattern',
        'cmsStoredDatetime',
        'cmsStoredValue',
        'cmsText',
        'cmsWrite',
        'toCmsRow',
      ],
      paths.runtime,
      source
    ),
    imports(['CmsDescribedCollection'], paths.runtime, source, 'type '),
    imports(schemaNames, paths.schemas, source),
    ...lines.map((line) => `${line}\n`),
    `\n${source}\n`,
  ].join('')
}
