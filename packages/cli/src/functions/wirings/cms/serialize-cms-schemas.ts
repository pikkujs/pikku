/**
 * The zod of every generated function. It is a file of its own that imports no
 * `#pikku` leaf: the CLI loads it to build the JSON schemas, which is what a
 * request is validated against.
 */
import type { CmsModel, CmsModelCollection } from './cms-model.types.js'
import {
  filterOperators,
  idSchema,
  operandSchema,
  outputSchema,
} from './cms-columns.js'
import { DESCRIBE_SCHEMA } from './serialize-cms-describe-schema.js'
import { getFunction, listFunction, pascal } from './cms-names.js'

export const schemaName = (functionName: string, side: 'Input' | 'Output') =>
  `${pascal(functionName)}${side}`

export const rowType = (collection: string, kind: 'ListRow' | 'Record') =>
  `Cms${pascal(collection)}${kind}`

const object = (entries: string[], strict = true) =>
  `z.${strict ? 'strictObject' : 'object'}({\n${entries.map((e) => `  ${e},`).join('\n')}\n})`

const rowSchema = (collection: CmsModelCollection, columns: string[]) =>
  object(
    columns.map(
      (column) => `${column}: ${outputSchema(collection.columns[column]!)}`
    ),
    false
  )

const filterSchema = (collection: CmsModelCollection): string => {
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

const listSchemas = (collection: CmsModelCollection): string[] => {
  const { name, list, listColumns } = collection
  const filter = `Cms${pascal(name)}Filter`
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
    ...(list.search.length ? [`search: z.string().max(200).optional()`] : []),
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

const getSchemas = (collection: CmsModelCollection): string[] => {
  const { name, primaryKey, columns, readColumns } = collection
  return [
    `export const ${rowType(name, 'Record')} = ${rowSchema(collection, readColumns)}`,
    `export const ${schemaName(getFunction(name), 'Input')} = ${object([
      `id: ${idSchema(columns[primaryKey]!)}`,
    ])}`,
    `export const ${schemaName(getFunction(name), 'Output')} = ${object(
      [`row: ${rowType(name, 'Record')}`],
      false
    )}`,
  ]
}

export const serializeCmsSchemas = (model: CmsModel): string =>
  `import { z } from 'zod'

${DESCRIBE_SCHEMA}

${model.collections
  .flatMap((collection) => [
    ...listSchemas(collection),
    ...getSchemas(collection),
  ])
  .join('\n\n')}
`
