/**
 * The functions of an addon's collection. They guard, validate and audit as the
 * app's own do, and hand every read and write to the addon's handlers: the
 * addon's rules are in its code, so no query on its tables is generated.
 */
import type { CmsModelCollection } from './cms-model.types.js'
import { stampedColumn } from './build-cms-model.js'
import {
  actionFunction,
  createFunction,
  deleteFunction,
  getFunction,
  listFunction,
  updateFunction,
} from './cms-names.js'
import { rowType, schemaName } from './serialize-cms-schemas.js'
import {
  guards,
  kinds,
  upperSnake,
  type Alias,
} from './serialize-cms-guards.js'

const handlers = (collection: CmsModelCollection) =>
  `${collection.name}Handlers`

const constants = (collection: CmsModelCollection): string => {
  const { name, list, listColumns, readColumns, fields, actions } = collection
  const prefix = upperSnake(name)
  const edited = fields.map((f) => f.name).filter((f) => f !== 'tags')
  const taken = [...new Set(actions.flatMap((action) => action.input))]
  return [
    `const ${prefix}_LIST_KINDS = ${kinds(collection, listColumns)}`,
    `const ${prefix}_KINDS = ${kinds(collection, readColumns)}`,
    ...(list.filter.length
      ? [`const ${prefix}_FILTER_KINDS = ${kinds(collection, list.filter)}`]
      : []),
    ...(edited.length
      ? [`const ${prefix}_FIELD_KINDS = ${kinds(collection, edited)}`]
      : []),
    ...(taken.length
      ? [`const ${prefix}_ACTION_KINDS = ${kinds(collection, taken)}`]
      : []),
  ].join('\n')
}

/** What a write hands over: the declared fields the caller gave, and no other. */
const given = (collection: CmsModelCollection, from: string) => {
  const columns = collection.fields.some((f) => f.name !== 'tags')
    ? `${upperSnake(collection.name)}_FIELD_KINDS`
    : '{}'
  return collection.tags
    ? `{ ...cmsPick(${from}, ${columns}), ...(${from}.tags ? { tags: ${from}.tags } : {}) }`
    : `cmsPick(${from}, ${columns})`
}

const record = (collection: CmsModelCollection) =>
  `cmsRecord<z.infer<typeof ${rowType(collection.name, 'Record')}>>(row, ${upperSnake(collection.name)}_KINDS${collection.tags ? ', true' : ''})`

const listSource = (collection: CmsModelCollection, alias: Alias) => {
  const { name, label, list } = collection
  const prefix = upperSnake(name)
  const fn = listFunction(name)
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: list ${label}`)},
  expose: true,
  readonly: true,
${guards(collection, 'read', alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely, logger }, input, { session }) => {
    const { limit, offset } = cmsPage(input)
    const { rows, hasMore } = await ${handlers(collection)}.list(
      { kysely, logger },
      {
        limit,
        offset,
        conditions: ${list.filter.length ? `cmsConditions(input.filter, ${prefix}_FILTER_KINDS)` : '[]'},
        sort: ${list.sort.length ? 'input.sort ?? []' : '[]'},
        search: ${list.search.length ? 'input.search || undefined' : 'undefined'},
      },
      session
    )
    return {
      rows: rows
        .slice(0, limit)
        .map((row) => cmsRecord<z.infer<typeof ${rowType(name, 'ListRow')}>>(row, ${prefix}_LIST_KINDS)),
      nextCursor: hasMore ? String(offset + limit) : null,
    }
  },
})`
}

const getSource = (collection: CmsModelCollection, alias: Alias) => {
  const { name, label } = collection
  const fn = getFunction(name)
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`CMS: one record of ${label}`)},
  expose: true,
  readonly: true,
${guards(collection, 'read', alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely, logger }, { id }, { session }) => {
    const { row } = await ${handlers(collection)}.get(
      { kysely, logger },
      { id },
      session
    )
    return { row: ${record(collection)} }
  },
})`
}

const mutation = (
  collection: CmsModelCollection,
  operation: string,
  fn: string,
  description: string,
  params: string,
  body: string,
  alias: Alias
) => `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(description)},
  expose: true,
  audit: true,
${guards(collection, operation, alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely, logger, auditLog }, ${params}, { session }) => {
${body}
  },
})`

const createSource = (collection: CmsModelCollection, alias: Alias) => {
  const { name, label, primaryKey } = collection
  const id = `answer.${primaryKey}`
  return mutation(
    collection,
    'create',
    createFunction(name),
    `CMS: create a record of ${label}`,
    '{ values }',
    `    const { row } = await cmsWrite('create', () =>
      ${handlers(collection)}.create!(
        { kysely, logger },
        { values: ${given(collection, 'values')} },
        session
      )
    )
    const answer = ${record(collection)}
    await cmsAudit(auditLog, 'created', '${name}', ${id}, Object.keys(values))
    return { row: answer }`,
    alias
  )
}

const updateSource = (collection: CmsModelCollection, alias: Alias) => {
  const { name, label } = collection
  const version = stampedColumn(collection)
  return mutation(
    collection,
    'edit',
    updateFunction(name),
    `CMS: change a record of ${label}`,
    version ? '{ id, patch, expectedUpdatedAt }' : '{ id, patch }',
    `    const changed = cmsChanged(patch)
    const { row } = await cmsWrite('update', () =>
      ${handlers(collection)}.update!(
        { kysely, logger },
        { id, patch: ${given(collection, 'patch')}${version ? ', expectedUpdatedAt' : ''} },
        session
      )
    )
    const answer = ${record(collection)}
    await cmsAudit(auditLog, 'updated', '${name}', id, changed)
    return { row: answer }`,
    alias
  )
}

const deleteSource = (collection: CmsModelCollection, alias: Alias) => {
  const { name, label } = collection
  return mutation(
    collection,
    'delete',
    deleteFunction(name),
    `CMS: delete a record of ${label}`,
    '{ id }',
    `    const { removed } = await cmsWrite('delete', () =>
      ${handlers(collection)}.delete!({ kysely, logger }, { id }, session)
    )
    if (!removed) {
      throw new NotFoundError('There is no record with that id')
    }
    await cmsAudit(auditLog, 'deleted', '${name}', id)
    return { removed: true }`,
    alias
  )
}

const actionSource = (
  collection: CmsModelCollection,
  action: CmsModelCollection['actions'][number],
  alias: Alias
) => {
  const { name, label } = collection
  const taken = action.input.length
  return mutation(
    collection,
    action.name,
    actionFunction(name, action.name),
    `CMS: ${action.label} (${label})`,
    taken ? '{ id, input }' : '{ id }',
    `    const { row } = await cmsWrite('update', () =>
      ${handlers(collection)}.actions!.${action.name}!(
        { kysely, logger },
        { id, input: ${taken ? `cmsPick(input, ${upperSnake(name)}_ACTION_KINDS)` : '{}'} },
        session
      )
    )
    const answer = ${record(collection)}
    await cmsAuditAction(auditLog, '${action.name}', '${name}', id)
    return { row: answer }`,
    alias
  )
}

export const addonCollectionSource = (
  collection: CmsModelCollection,
  handlersImport: string,
  holds: string[],
  alias: Alias
): string =>
  [
    `const ${handlers(collection)} = cmsAddonHandlers(${handlersImport}, '${collection.name}')`,
    constants(collection),
    ...holds,
    listSource(collection, alias),
    getSource(collection, alias),
    ...(collection.create ? [createSource(collection, alias)] : []),
    ...(collection.edit ? [updateSource(collection, alias)] : []),
    ...(collection.delete ? [deleteSource(collection, alias)] : []),
    ...collection.actions.map((action) =>
      actionSource(collection, action, alias)
    ),
  ].join('\n\n')
