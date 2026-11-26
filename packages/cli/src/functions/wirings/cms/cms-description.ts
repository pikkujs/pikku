/**
 * What `describeCms` answers for a caller who holds everything. The generated
 * function narrows it to what its caller may do.
 */
import type {
  CmsCollectionDescription,
  CmsFieldDescription,
} from '@pikku/core/cms'
import type {
  CmsColumn,
  CmsModel,
  CmsModelCollection,
} from './cms-model.types.js'
import { derivedInput } from './build-cms-model.js'
import {
  createFunction,
  deleteFunction,
  getFunction,
  humanise,
  listFunction,
  updateFunction,
} from './cms-names.js'

const describeField = (
  model: CmsModel,
  collection: CmsModelCollection,
  column: CmsColumn
): CmsFieldDescription => {
  const field = collection.fields.find((f) => f.name === column.name)
  const input = field?.input ?? derivedInput(column)
  // A reference the collection does not edit is only an id to read.
  const plainReference = !field && input === 'relation'
  return {
    name: column.name,
    label: field?.label ?? humanise(column.name),
    input: plainReference ? 'text' : input,
    editable: field !== undefined,
    required: Boolean(
      field && collection.create && !column.nullable && !column.hasDefault
    ),
    nullable: column.nullable,
    help: field?.help,
    options: column.enum ? [...column.enum] : undefined,
    min: column.min,
    max: column.max,
    maxLength: column.maxLength,
    currency: field?.currency,
    accept: field?.image?.accept,
    maxBytes: field?.image?.maxBytes,
    target: field?.target,
    untrusted: collection.submitted.includes(column.name) || undefined,
  }
}

const describeCollection = (
  model: CmsModel,
  collection: CmsModelCollection
): CmsCollectionDescription => {
  const { name } = collection
  const edited = collection.fields.map((field) => field.name)
  const fields = [
    ...edited,
    ...collection.readColumns.filter((column) => !edited.includes(column)),
  ]
  return {
    name,
    label: collection.label,
    primaryKey: collection.primaryKey,
    title: collection.title,
    thumbnail: collection.thumbnail,
    badge: collection.badge,
    operations: [
      'read',
      ...(collection.create ? ['create' as const] : []),
      ...(collection.edit ? ['edit' as const] : []),
      ...(collection.delete ? ['delete' as const] : []),
    ],
    functions: {
      list: listFunction(name),
      get: getFunction(name),
      create: collection.create ? createFunction(name) : undefined,
      update: collection.edit ? updateFunction(name) : undefined,
      delete: collection.delete ? deleteFunction(name) : undefined,
    },
    actions: [],
    list: collection.list,
    detail: collection.detail,
    submitted: collection.submitted,
    groups: collection.groups,
    pii: collection.pii,
    deletesAlso: collection.delete ? collection.deletesAlso : [],
    fields: fields.map((column) =>
      describeField(model, collection, collection.columns[column]!)
    ),
  }
}

export const describeCmsModel = (model: CmsModel): CmsCollectionDescription[] =>
  model.collections.map((collection) => describeCollection(model, collection))
