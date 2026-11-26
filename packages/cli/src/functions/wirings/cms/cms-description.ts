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
  actionFunction,
  createFunction,
  deleteFunction,
  getFunction,
  humanise,
  listFunction,
  optionsFunction,
  updateFunction,
  uploadFunction,
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
    uploadFunction:
      field?.image && (collection.create || collection.edit)
        ? uploadFunction(collection.name, column.name)
        : undefined,
    optionsFunction:
      field?.input === 'relation' && (collection.create || collection.edit)
        ? optionsFunction(collection.name, column.name)
        : undefined,
    untrusted: collection.submitted.includes(column.name) || undefined,
  }
}

const describeTags = (
  collection: CmsModelCollection,
  tags: NonNullable<CmsModelCollection['tags']>
): CmsFieldDescription => ({
  name: 'tags',
  label: tags.label,
  help: tags.help,
  input: 'tags',
  editable: collection.fields.some((field) => field.name === 'tags'),
  required: false,
  nullable: false,
  maxItems: tags.maxItems,
  maxLength: tags.maxLength,
})

const describeCollection = (
  model: CmsModel,
  collection: CmsModelCollection
): CmsCollectionDescription => {
  const { name } = collection
  const edited = collection.fields.map((field) => field.name)
  const fields = [
    ...edited,
    ...collection.readColumns.filter((column) => !edited.includes(column)),
    ...(collection.tags && !edited.includes('tags') ? ['tags'] : []),
  ]
  return {
    name,
    label: collection.label,
    from: collection.from?.name,
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
    actions: collection.actions.map((action) => ({
      name: action.name,
      label: action.label,
      function: actionFunction(name, action.name),
      confirm: action.confirm,
      input: action.input.map((column) => ({
        ...describeField(model, collection, collection.columns[column]!),
        editable: true,
        required: false,
      })),
    })),
    list: collection.list,
    detail: collection.detail,
    submitted: collection.submitted,
    groups: collection.groups,
    pii: collection.pii,
    deletesAlso: collection.delete ? collection.deletesAlso : [],
    fields: fields.map((column) =>
      column === 'tags' && collection.tags
        ? describeTags(collection, collection.tags)
        : describeField(model, collection, collection.columns[column]!)
    ),
  }
}

export const describeCmsModel = (model: CmsModel): CmsCollectionDescription[] =>
  model.collections.map((collection) => describeCollection(model, collection))
