/**
 * The zod of every generated function. It is a file of its own that imports no
 * `#pikku` leaf: the CLI loads it to build the JSON schemas, which is what a
 * request is validated against.
 */
import type {
  CollectionsModel,
  CollectionModel,
} from './collection-model.types.js'
import {
  filterOperators,
  idSchema,
  imageKeySchema,
  NO_NUL,
  searchSchema,
  operandSchema,
  outputSchema,
  valueSchema,
} from './collection-columns.js'
import {
  imageFields,
  relationTarget,
  stampedColumn,
} from './build-collection-model.js'
import { DESCRIBE_SCHEMA } from './serialize-collection-describe-schema.js'
import {
  actionFunction,
  createFunction,
  deleteFunction,
  getFunction,
  listFunction,
  optionsFunction,
  pascal,
  updateFunction,
  uploadFunction,
} from './collection-names.js'

export const schemaName = (functionName: string, side: 'Input' | 'Output') =>
  `${pascal(functionName)}${side}`

export const rowType = (collection: string, kind: 'ListRow' | 'Record') =>
  `Collection${pascal(collection)}${kind}`

const object = (entries: string[], strict = true) =>
  `z.${strict ? 'strictObject' : 'object'}({\n${entries.map((e) => `  ${e},`).join('\n')}\n})`

const rowSchema = (
  collection: CollectionModel,
  columns: string[],
  extra: string[] = []
) =>
  object(
    [
      ...columns.map(
        (column) => `${column}: ${outputSchema(collection.columns[column]!)}`
      ),
      ...extra,
    ],
    false
  )

const filterSchema = (collection: CollectionModel): string => {
  const leaves = collection.list.filter.map((name) => {
    const column = collection.columns[name]!
    const operand = operandSchema(column)
    const operators = filterOperators(column).map((operator) =>
      operator === 'in'
        ? `in: z.array(${operand}).min(1).max(100).optional()`
        : `${operator}: ${operand}.optional()`
    )
    return `z.strictObject({ ${name}: z.strictObject({ ${operators.join(', ')} }) })`
  })
  return leaves.length === 1
    ? leaves[0]!
    : `z.union([\n  ${leaves.join(',\n  ')},\n])`
}

const listSchemas = (collection: CollectionModel): string[] => {
  const { name, list, listColumns } = collection
  const filter = `Collection${pascal(name)}Filter`
  const input = [
    `cursor: z.string().regex(/^(0|[1-9]\\d{0,8})$/).optional()`,
    `limit: z.number().int().min(1).max(100).optional()`,
    ...(list.filter.length
      ? [`filter: z.union([${filter}, z.array(${filter}).max(20)]).optional()`]
      : []),
    ...(list.sort.length
      ? [
          `sort: z.array(z.strictObject({ column: z.enum(${JSON.stringify(list.sort)}), direction: z.enum(['asc', 'desc']) })).max(${list.sort.length}).optional()`,
        ]
      : []),
    ...(list.search.length ? [`search: ${searchSchema}.optional()`] : []),
  ]
  return [
    `export const ${rowType(name, 'ListRow')} = ${rowSchema(collection, listColumns)}`,
    ...(list.filter.length
      ? [`const ${filter} = ${filterSchema(collection)}`]
      : []),
    `export const ${schemaName(listFunction(name), 'Input')} = ${object(input)}`,
    `export const ${schemaName(listFunction(name), 'Output')} = ${object(
      [
        `rows: z.array(${rowType(name, 'ListRow')})`,
        `nextCursor: z.string().nullable()`,
      ],
      false
    )}`,
  ]
}

/** The schemas of the upload and options functions a collection's fields have. */
const fieldFunctionSchemas = (
  model: CollectionsModel,
  collection: CollectionModel
): string[] => {
  if (!collection.create && !collection.edit) return []
  const pair = (fn: string, input: string[], output: string[]) => [
    `export const ${schemaName(fn, 'Input')} = ${object(input)}`,
    `export const ${schemaName(fn, 'Output')} = ${object(output, false)}`,
  ]
  return collection.fields.flatMap((field) => {
    if (field.image) {
      const operations = [
        ...(collection.create ? ['create'] : []),
        ...(collection.edit ? ['edit'] : []),
      ]
      return pair(
        uploadFunction(collection.name, field.name),
        [
          `for: z.enum(${JSON.stringify(operations)})`,
          `contentType: z.enum(${JSON.stringify(field.image.accept)})`,
          `byteLength: z.number().int().min(1).max(${field.image.maxBytes})`,
        ],
        [
          `uploadUrl: z.string()`,
          `fileKey: z.string()`,
          `uploadMethod: z.enum(['PUT', 'POST']).optional()`,
          `uploadHeaders: z.record(z.string(), z.string()).optional()`,
        ]
      )
    }
    if (field.input !== 'relation') return []
    const target = relationTarget(model, field.target!)
    const key = target.columns[target.primaryKey]!
    return pair(
      optionsFunction(collection.name, field.name),
      [
        `search: ${searchSchema}.optional()`,
        `ids: z.array(${idSchema(key)}).min(1).max(100).optional()`,
        `limit: z.number().int().min(1).max(100).optional()`,
      ],
      [
        `rows: z.array(${object([`id: ${outputSchema(key)}`, `label: z.string().nullable()`], false)})`,
      ]
    )
  })
}

const getSchemas = (collection: CollectionModel): string[] => {
  const { name, primaryKey, columns, readColumns } = collection
  return [
    `export const ${rowType(name, 'Record')} = ${rowSchema(collection, readColumns, collection.tags ? ['tags: z.array(z.string())'] : [])}`,
    `export const ${schemaName(getFunction(name), 'Input')} = ${object([
      `id: ${idSchema(columns[primaryKey]!)}`,
    ])}`,
    `export const ${schemaName(getFunction(name), 'Output')} = ${object(
      [
        `row: ${rowType(name, 'Record')}`,
        ...(imageFields(collection).length
          ? [
              `previewUrls: ${object(
                imageFields(collection).map(
                  (field) => `${field.name}: z.string().nullable()`
                ),
                false
              )}`,
            ]
          : []),
      ],
      false
    )}`,
  ]
}

/**
 * One editable field as a caller sends it. A create must name what nothing else
 * fills; a patch names only what it changes.
 */
const fieldSchema = (
  collection: CollectionModel,
  name: string,
  operation: 'create' | 'update'
): string => {
  if (name === 'tags' && collection.tags) {
    const { maxItems, maxLength } = collection.tags
    return `tags: z.array(z.string().min(1).max(${maxLength})${NO_NUL}).max(${maxItems}).optional()`
  }
  const column = collection.columns[name]!
  const field = collection.fields.find((f) => f.name === name)!
  const value = field.image
    ? imageKeySchema(collection.name, name, field.image.accept)
    : valueSchema(column)
  const nullable = column.nullable ? '.nullable()' : ''
  const optional =
    operation === 'update' || column.nullable || column.hasDefault
      ? '.optional()'
      : ''
  return `${name}: ${value}${nullable}${optional}`
}

const valuesSchema = (
  collection: CollectionModel,
  operation: 'create' | 'update'
) =>
  object(
    collection.fields.map((field) =>
      fieldSchema(collection, field.name, operation)
    )
  )

/** An action takes a record's id and, each optional, the columns it names. */
const actionSchemas = (collection: CollectionModel): string[] => {
  const { name, primaryKey, columns } = collection
  return collection.actions.flatMap((action) => {
    const fn = actionFunction(name, action.name)
    const taken = action.input.map((column) => {
      const nullable = columns[column]!.nullable ? '.nullable()' : ''
      return `${column}: ${valueSchema(columns[column]!)}${nullable}.optional()`
    })
    return [
      `export const ${schemaName(fn, 'Input')} = ${object([
        `id: ${idSchema(columns[primaryKey]!)}`,
        ...(taken.length ? [`input: ${object(taken)}.optional()`] : []),
      ])}`,
      `export const ${schemaName(fn, 'Output')} = ${object([`row: ${rowType(name, 'Record')}`], false)}`,
    ]
  })
}

const writeSchemas = (collection: CollectionModel): string[] => {
  const { name, primaryKey, columns } = collection
  const id = `id: ${idSchema(columns[primaryKey]!)}`
  const record = object([`row: ${rowType(name, 'Record')}`], false)
  const pair = (fn: string, input: string[], output: string) => [
    `export const ${schemaName(fn, 'Input')} = ${object(input)}`,
    `export const ${schemaName(fn, 'Output')} = ${output}`,
  ]
  return [
    ...(collection.create
      ? pair(
          createFunction(name),
          [`values: ${valuesSchema(collection, 'create')}`],
          record
        )
      : []),
    ...(collection.edit
      ? pair(
          updateFunction(name),
          [
            id,
            `patch: ${valuesSchema(collection, 'update')}`,
            ...(stampedColumn(collection)
              ? [`expectedUpdatedAt: z.string().max(64).optional()`]
              : []),
          ],
          record
        )
      : []),
    ...(collection.delete
      ? pair(
          deleteFunction(name),
          [id],
          object([`removed: z.boolean()`], false)
        )
      : []),
  ]
}

export const serializeCollectionSchemas = (model: CollectionsModel): string =>
  `import { z } from 'zod'

${DESCRIBE_SCHEMA}

${model.collections
  .flatMap((collection) => [
    ...listSchemas(collection),
    ...getSchemas(collection),
    ...writeSchemas(collection),
    ...actionSchemas(collection),
    ...fieldFunctionSchemas(model, collection),
  ])
  .join('\n\n')}
`
