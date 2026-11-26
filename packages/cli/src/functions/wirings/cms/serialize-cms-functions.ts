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
import { describeCmsModel } from './cms-description.js'
import {
  DESCRIBE_FUNCTION,
  getFunction,
  listFunction,
  pascal,
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

/** The scopes and the app checks of one operation, all of which must pass. */
export const guards = (
  collection: CmsModelCollection,
  operation: CmsOperation,
  alias: Alias
): string => {
  const { name, checks } = collection
  const scopes = [...new Set(['read' as const, operation])].map(
    (op) => `'cms:${name}:${op}'`
  )
  const required = [...new Set(['read' as const, operation])].flatMap((op) =>
    checks[op] ? [alias(checks[op]!)] : []
  )
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

const constants = (collection: CmsModelCollection): string => {
  const prefix = upperSnake(collection.name)
  const { listColumns, readColumns, list } = collection
  return [
    `const ${prefix}_LIST_COLUMNS = ${JSON.stringify(listColumns)} as const`,
    `const ${prefix}_LIST_KINDS = ${kinds(collection, listColumns)}`,
    `const ${prefix}_COLUMNS = ${JSON.stringify(readColumns)} as const`,
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
    `    let query = kysely.selectFrom('${name}').select(${prefix}_LIST_COLUMNS)`,
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

const getSource = (collection: CmsModelCollection, alias: Alias): string => {
  const { name, label, primaryKey } = collection
  const prefix = upperSnake(name)
  const fn = getFunction(name)
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: one record of ${label}`)},
  expose: true,
  readonly: true,
${guards(collection, 'read', alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely }, { id }) => {
    const row = await kysely
      .selectFrom('${name}')
      .select(${prefix}_COLUMNS)
      .where('${primaryKey}', '=', id)
      .executeTakeFirst()
    if (!row) throw new NotFoundError('There is no record with that id')
    return {
      row: toCmsRow<z.infer<typeof ${rowType(name, 'Record')}>>(row, ${prefix}_KINDS),
    }
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
  const holdsRead = model.collections.map(
    (collection) =>
      `const holdsCms${pascal(collection.name)}Read = pikkuAuth(async ({ scopeService }, session) =>
  cmsHolds('cms:${collection.name}:read', { scopeService }, session)
)`
  )
  // A group each, and any one group is enough. The app's read check sits in the
  // group itself, where the inspector sees which services it needs.
  const groups = model.collections.map((collection) => {
    const group = [
      `holdsCms${pascal(collection.name)}Read`,
      ...(collection.checks.read ? [alias(collection.checks.read)] : []),
    ]
    return `    ${collection.name}: [${group.join(', ')}],`
  })
  return `const CMS_COLLECTIONS: CmsDescribedCollection[] = [
${entries.join('\n')}
]

${holdsRead.join('\n\n')}

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
    listSource(collection, alias),
    getSource(collection, alias),
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
        'cmsConditions',
        'cmsDatetime',
        'cmsDescribe',
        'cmsHolds',
        'cmsPage',
        'cmsSearchPattern',
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
