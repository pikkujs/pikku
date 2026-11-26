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
  CmsModelField,
} from './cms-model.types.js'
import { imageExtensions, imagePrefix, valueKind } from './cms-columns.js'
import {
  imageFields,
  isServerFilledKey,
  relationTarget,
  stampedColumn,
} from './build-cms-model.js'
import { describeCmsModel } from './cms-description.js'
import {
  DESCRIBE_FUNCTION,
  createFunction,
  deleteFunction,
  getFunction,
  listFunction,
  optionsFunction,
  pascal,
  updateFunction,
  uploadFunction,
} from './cms-names.js'
import { rowType, schemaName } from './serialize-cms-schemas.js'
import { addonCollectionSource } from './serialize-cms-addon-functions.js'
import {
  guards,
  holder,
  holds,
  kinds,
  upperSnake,
  type Alias,
} from './serialize-cms-guards.js'

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

const relationFields = (collection: CmsModelCollection) =>
  collection.fields.filter((field) => field.input === 'relation')

/** What a write checks of the relations and images it is given, before it. */
const fieldChecks = (
  model: CmsModel,
  collection: CmsModelCollection,
  from: 'values' | 'patch',
  alias: Alias
): string =>
  [
    ...relationFields(collection).map((field) => {
      const target = relationTarget(model, field.target!)
      const check = target.checks.read
      const args = [
        `'cms:${target.name}:read'`,
        check ? 'services' : '{ scopeService }',
        'session',
        ...(check ? [alias(check)] : []),
      ]
      return `    if (${from}.${field.name} != null) {
      await cmsMayLink(${args.join(', ')})
      cmsLinked(
        await kysely
          .selectFrom('${target.name}')
          .select('${target.primaryKey}')
          .where('${target.primaryKey}', '=', ${from}.${field.name})
          .executeTakeFirst(),
        '${field.name}'
      )
    }
`
    }),
    ...imageFields(collection).map(
      (field) =>
        `    await cmsUploaded(content, '${field.image!.bucket}', ${from}.${field.name})
`
    ),
  ].join('')

/** The signature of a create or an update, with the services its checks use. */
const writeSignature = (
  model: CmsModel,
  collection: CmsModelCollection,
  params: string
) => {
  const relations = relationFields(collection)
  // A target's own read check may use any service, so the function takes all.
  const every = relations.some(
    (field) => relationTarget(model, field.target!).checks.read
  )
  const services = [
    'kysely',
    'auditLog',
    ...(relations.length && !every ? ['scopeService'] : []),
    ...(imageFields(collection).length ? ['content'] : []),
  ].join(', ')
  const wire = relations.length ? ', { session }' : ''
  return every
    ? {
        head: `async (services, ${params}${wire}) => {`,
        open: `    const { ${services} } = services\n`,
      }
    : { head: `async ({ ${services} }, ${params}${wire}) => {`, open: '' }
}

const mutation = (
  collection: CmsModelCollection,
  operation: 'create' | 'edit' | 'delete',
  fn: string,
  description: string,
  signature: { head: string; open: string },
  body: string,
  alias: Alias
) => `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: ${description} ${collection.label}`)},
  expose: true,
  audit: true,
${guards(collection, operation, alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: ${signature.head}
${signature.open}${body}
  },
})`

const createSource = (
  model: CmsModel,
  collection: CmsModelCollection,
  alias: Alias
): string => {
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
    writeSignature(model, collection, '{ values }'),
    `${fieldChecks(model, collection, 'values', alias)}${body}
    await cmsAudit(auditLog, 'created', '${name}', id, Object.keys(values))
    const row = ${selectRecord(collection, 'id')}
${answerRecord(collection)}`,
    alias
  )
}

const updateSource = (
  model: CmsModel,
  collection: CmsModelCollection,
  alias: Alias
): string => {
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
    writeSignature(
      model,
      collection,
      version ? '{ id, patch, expectedUpdatedAt }' : '{ id, patch }'
    ),
    `    const changed = cmsChanged(patch)
${fieldChecks(model, collection, 'patch', alias)}${read}    let query = kysely
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
    { head: 'async ({ kysely, auditLog }, { id }) => {', open: '' },
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
  const images = imageFields(collection)
  const answer = images.length
    ? `    if (!row) throw new NotFoundError('There is no record with that id')
    const record = toCmsRow<z.infer<typeof ${rowType(name, 'Record')}>>(row, ${upperSnake(name)}_KINDS)
    return {
      row: record,
      previewUrls: {
${images
  .map(
    (field) =>
      `        ${field.name}: await cmsPreviewUrl(content, '${field.image!.bucket}', '${imagePrefix(name, field.name)}', record.${field.name}),`
  )
  .join('\n')}
      },
    }`
    : answerRecord(collection)
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: one record of ${label}`)},
  expose: true,
  readonly: true,
${guards(collection, 'read', alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely${images.length ? ', content' : ''} }, { id }) => {
    const row = ${selectRecord(collection, 'id')}
${answer}
  },
})`
}

/**
 * The upload function of an image field. Which grant it needs depends on its
 * input, so a permission reads it, from the stored grants and never from the
 * session's own list.
 */
const uploadSource = (
  collection: CmsModelCollection,
  field: CmsModelField,
  alias: Alias
): string => {
  const { name, label, checks } = collection
  const fn = uploadFunction(name, field.name)
  const image = field.image!
  const permission = `may${pascal(fn)}`
  const operations = (['create', 'edit'] as const).filter((operation) =>
    operation === 'create' ? collection.create : collection.edit
  )
  const operationType = operations.map((o) => `'${o}'`).join(' | ')
  const appChecks = operations.flatMap((operation) =>
    checks[operation] ? [`${operation}: ${alias(checks[operation]!)}`] : []
  )
  const source = `const ${permission} = pikkuPermission(
  async ({ scopeService }, data: { for: ${operationType} }, { session }) =>
    cmsHolds(['cms:${name}:read', \`cms:${name}:\${data.for}\`], { scopeService }, session)
)`
  // The app's check of that operation is asked in the body, which takes every
  // service for it: a permission has to name the services it uses.
  const body = appChecks.length
    ? {
        head: 'async (services, { for: operation, contentType, byteLength }, { session }) => {',
        open: `    await cmsMustPass({ ${appChecks.join(', ')} }, operation, services, session)
    const { content } = services
`,
      }
    : {
        head: 'async ({ content }, { contentType, byteLength }) => {',
        open: '',
      }
  const group = [permission, ...(checks.read ? [alias(checks.read)] : [])].join(
    ', '
  )
  return `${source}

export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: a URL to upload ${field.label} of ${label} to`)},
  expose: true,
  scopes: ['cms:${name}:read'],
  permissions: { cms: [${group}] },
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: ${body.head}
${body.open}    const upload = await cmsContent(content).getUploadURL({
      bucket: '${image.bucket}',
      fileKey: cmsImageKey('${imagePrefix(name, field.name)}', ${JSON.stringify(imageExtensions(image.accept))}, contentType),
      contentType,
      size: byteLength,
      visibility: 'private',
    })
    return {
      uploadUrl: upload.uploadUrl,
      fileKey: upload.fileKey,
      uploadMethod: upload.uploadMethod,
      uploadHeaders: upload.uploadHeaders,
    }
  },
})`
}

/** The records a relation can point at, as ids and titles. */
const optionsSource = (
  model: CmsModel,
  collection: CmsModelCollection,
  field: CmsModelField,
  alias: Alias
): string => {
  const target = relationTarget(model, field.target!)
  const fn = optionsFunction(collection.name, field.name)
  const { primaryKey, title } = target
  const scopes = [...new Set([collection.name, target.name])].map(
    (name) => `'cms:${name}:read'`
  )
  const checks = [
    ...new Set(
      [collection, target].flatMap((c) =>
        c.checks.read ? [alias(c.checks.read)] : []
      )
    ),
  ]
  const id =
    valueKind(target.columns[primaryKey]!) === 'number'
      ? `Number(row.${primaryKey})`
      : `row.${primaryKey}`
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: ${target.label} to choose as ${field.label} of ${collection.label}`)},
  expose: true,
  readonly: true,
  scopes: [${scopes.join(', ')}],
${checks.length ? `  permissions: { cms: [${checks.join(', ')}] },\n` : ''}  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely }, { search, ids, limit }) => {
    let query = kysely
      .selectFrom('${target.name}')
      .select('${primaryKey}')
      .select(cmsText('${title}'))
    if (ids) query = query.where('${primaryKey}', 'in', ids)
    if (search) {
      const pattern = cmsSearchPattern(search)
      query = query.where(
        sql<boolean>\`lower(cast(\${sql.ref('${title}')} as text)) like lower(\${pattern}) escape '!'\`
      )
    }
    const rows = await query
      .orderBy(sql.ref('${title}'), 'asc')
      .orderBy('${primaryKey}', 'asc')
      .limit(limit ?? (ids ? 100 : 20))
      .execute()
    return {
      rows: rows.map((row) => ({
        id: ${id},
        label: row.cmsText${pascal(title)},
      })),
    }
  },
})`
}

const describeSource = (model: CmsModel, alias: Alias): string => {
  const descriptions = describeCmsModel(model)
  const entries = model.collections.map((collection, index) => {
    const checks = [
      'read',
      ...OPERATIONS,
      ...collection.actions.map((action) => action.name),
    ].flatMap((op) =>
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

/** The grants each write and action of a collection reads again. */
const writeHolds = (collection: CmsModelCollection) => [
  holds(collection.name, 'read'),
  ...(['create', 'edit', 'delete'] as const)
    .filter((operation) => collection[operation])
    .map((operation) => holds(collection.name, operation)),
  ...collection.actions.map((action) => holds(collection.name, action.name)),
]

/** What a collection gets besides `describeCms`. */
const collectionSource = (
  model: CmsModel,
  collection: CmsModelCollection,
  alias: Alias
): string =>
  [
    constants(collection),
    ...writeHolds(collection),
    listSource(collection, alias),
    getSource(collection, alias),
    ...(collection.create ? [createSource(model, collection, alias)] : []),
    ...(collection.edit ? [updateSource(model, collection, alias)] : []),
    ...(collection.delete ? [deleteSource(collection, alias)] : []),
    ...(collection.create || collection.edit
      ? collection.fields.flatMap((field) =>
          field.image
            ? [uploadSource(collection, field, alias)]
            : field.input === 'relation'
              ? [optionsSource(model, collection, field, alias)]
              : []
        )
      : []),
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
  const packages = [
    ...new Set(model.collections.flatMap((c) => c.from?.package ?? [])),
  ]
  const source = [
    ...model.collections.map((c) =>
      c.from
        ? addonCollectionSource(
            c,
            `addonCms${packages.indexOf(c.from.package)}`,
            writeHolds(c),
            alias
          )
        : collectionSource(model, c, alias)
    ),
    describeSource(model, alias),
  ].join('\n\n')
  return [
    imports(['sql'], 'kysely', source),
    imports(['z'], 'zod', source, 'type '),
    imports(['pikkuFunc'], paths.functionLeaf, source),
    imports(['pikkuAuth', 'pikkuPermission'], paths.authLeaf, source),
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
        'cmsAddonHandlers',
        'cmsAudit',
        'cmsAuditAction',
        'cmsChanged',
        'cmsConditions',
        'cmsContent',
        'cmsDatetime',
        'cmsDescribe',
        'cmsHolds',
        'cmsImageKey',
        'cmsLinked',
        'cmsMayLink',
        'cmsMustPass',
        'cmsPage',
        'cmsPick',
        'cmsPreviewUrl',
        'cmsRecord',
        'cmsSearchPattern',
        'cmsStoredDatetime',
        'cmsStoredValue',
        'cmsText',
        'cmsUploaded',
        'cmsWrite',
        'toCmsRow',
      ],
      paths.runtime,
      source
    ),
    imports(['CmsDescribedCollection'], paths.runtime, source, 'type '),
    imports(schemaNames, paths.schemas, source),
    ...lines.map((line) => `${line}\n`),
    ...packages.map(
      (name, index) =>
        `import { cmsHandlers as addonCms${index} } from '${name}/cms'\n`
    ),
    `\n${source}\n`,
  ].join('')
}
