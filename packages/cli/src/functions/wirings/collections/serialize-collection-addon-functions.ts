/**
 * The functions of an addon's collection. They guard, validate and audit as the
 * app's own do, and hand every read and write to the addon's handlers: the
 * addon's rules are in its code, so no query on its tables is generated.
 */
import type { CollectionModel } from './collection-model.types.js'
import { stampedColumn } from './build-collection-model.js'
import {
  actionFunction,
  createFunction,
  deleteFunction,
  getFunction,
  listFunction,
  updateFunction,
} from './collection-names.js'
import { rowType, schemaName } from './serialize-collection-schemas.js'
import {
  guards,
  kinds,
  upperSnake,
  type Alias,
} from './serialize-collection-guards.js'

const handlers = (collection: CollectionModel) => `${collection.name}Handlers`

const constants = (collection: CollectionModel): string => {
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
const given = (collection: CollectionModel, from: string) => {
  const columns = collection.fields.some((f) => f.name !== 'tags')
    ? `${upperSnake(collection.name)}_FIELD_KINDS`
    : '{}'
  return collection.tags
    ? `{ ...collectionPick(${from}, ${columns}), ...(${from}.tags ? { tags: ${from}.tags } : {}) }`
    : `collectionPick(${from}, ${columns})`
}

const record = (collection: CollectionModel) =>
  `collectionRecord<z.infer<typeof ${rowType(collection.name, 'Record')}>>(row, ${upperSnake(collection.name)}_KINDS${collection.tags ? ', true' : ''})`

const listSource = (collection: CollectionModel, alias: Alias) => {
  const { name, label, list } = collection
  const prefix = upperSnake(name)
  const fn = listFunction(name)
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`collection: list ${label}`)},
  expose: true,
  readonly: true,
${guards(collection, 'read', alias)}
  input: ${schemaName(fn, 'Input')},
  output: ${schemaName(fn, 'Output')},
  func: async ({ kysely, logger }, input, { session }) => {
    const { limit, offset } = collectionPage(input)
    const { rows, hasMore } = await ${handlers(collection)}.list(
      { kysely, logger },
      {
        limit,
        offset,
        conditions: ${list.filter.length ? `collectionConditions(input.filter, ${prefix}_FILTER_KINDS)` : '[]'},
        sort: ${list.sort.length ? 'input.sort ?? []' : '[]'},
        search: ${list.search.length ? 'input.search || undefined' : 'undefined'},
      },
      session
    )
    return {
      rows: rows
        .slice(0, limit)
        .map((row) => collectionRecord<z.infer<typeof ${rowType(name, 'ListRow')}>>(row, ${prefix}_LIST_KINDS)),
      nextCursor: hasMore ? String(offset + limit) : null,
    }
  },
})`
}

const getSource = (collection: CollectionModel, alias: Alias) => {
  const { name, label } = collection
  const fn = getFunction(name)
  return `export const ${fn} = pikkuFunc({
  description: ${JSON.stringify(`collection: one record of ${label}`)},
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
  collection: CollectionModel,
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

const createSource = (collection: CollectionModel, alias: Alias) => {
  const { name, label, primaryKey } = collection
  const id = `answer.${primaryKey}`
  return mutation(
    collection,
    'create',
    createFunction(name),
    `collection: create a record of ${label}`,
    '{ values }',
    `    const { row } = await collectionWrite('create', () =>
      ${handlers(collection)}.create!(
        { kysely, logger },
        { values: ${given(collection, 'values')} },
        session
      )
    )
    const answer = ${record(collection)}
    await collectionAudit(auditLog, 'created', '${name}', ${id}, Object.keys(values))
    return { row: answer }`,
    alias
  )
}

const updateSource = (collection: CollectionModel, alias: Alias) => {
  const { name, label } = collection
  const version = stampedColumn(collection)
  return mutation(
    collection,
    'edit',
    updateFunction(name),
    `collection: change a record of ${label}`,
    version ? '{ id, patch, expectedUpdatedAt }' : '{ id, patch }',
    `    const changed = collectionChanged(patch)
    const { row } = await collectionWrite('update', () =>
      ${handlers(collection)}.update!(
        { kysely, logger },
        { id, patch: ${given(collection, 'patch')}${version ? ', expectedUpdatedAt' : ''} },
        session
      )
    )
    const answer = ${record(collection)}
    await collectionAudit(auditLog, 'updated', '${name}', id, changed)
    return { row: answer }`,
    alias
  )
}

const deleteSource = (collection: CollectionModel, alias: Alias) => {
  const { name, label } = collection
  return mutation(
    collection,
    'delete',
    deleteFunction(name),
    `collection: delete a record of ${label}`,
    '{ id }',
    `    const { removed } = await collectionWrite('delete', () =>
      ${handlers(collection)}.delete!({ kysely, logger }, { id }, session)
    )
    if (!removed) {
      throw new NotFoundError('There is no record with that id')
    }
    await collectionAudit(auditLog, 'deleted', '${name}', id)
    return { removed: true }`,
    alias
  )
}

const actionSource = (
  collection: CollectionModel,
  action: CollectionModel['actions'][number],
  alias: Alias
) => {
  const { name, label } = collection
  const taken = action.input.length
  return mutation(
    collection,
    action.name,
    actionFunction(name, action.name),
    `collection: ${action.label} (${label})`,
    taken ? '{ id, input }' : '{ id }',
    `    const { row } = await collectionWrite('update', () =>
      ${handlers(collection)}.actions!.${action.name}!(
        { kysely, logger },
        { id, input: ${taken ? `collectionPick(input, ${upperSnake(name)}_ACTION_KINDS)` : '{}'} },
        session
      )
    )
    const answer = ${record(collection)}
    await collectionAuditAction(auditLog, '${action.name}', '${name}', id)
    return { row: answer }`,
    alias
  )
}

export const addonCollectionSource = (
  collection: CollectionModel,
  handlersImport: string,
  holds: string[],
  alias: Alias
): string =>
  [
    `const ${handlers(collection)} = collectionAddonHandlers(${handlersImport}, '${collection.name}')`,
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
