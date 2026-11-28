import type { CollectionModel } from './collection-model.types.js'

export const pascal = (name: string): string =>
  name.charAt(0).toUpperCase() + name.slice(1)

/** `priceMinor` and `price_minor` read as `Price minor`. */
export const humanise = (name: string): string => {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const DESCRIBE_FUNCTION = 'describeCollections'

export const listFunction = (collection: string) =>
  `listCollection${pascal(collection)}`
export const getFunction = (collection: string) =>
  `getCollection${pascal(collection)}`
export const createFunction = (collection: string) =>
  `createCollection${pascal(collection)}`
export const updateFunction = (collection: string) =>
  `updateCollection${pascal(collection)}`
export const deleteFunction = (collection: string) =>
  `deleteCollection${pascal(collection)}`
export const uploadFunction = (collection: string, field: string) =>
  `createCollection${pascal(collection)}${pascal(field)}Upload`
export const actionFunction = (collection: string, action: string) =>
  `runCollection${pascal(collection)}${pascal(action)}`
export const optionsFunction = (collection: string, field: string) =>
  `searchCollection${pascal(collection)}${pascal(field)}Options`

/** Every function a collection gets, which is none for a disabled operation. */
export const collectionFunctionNames = (
  collection: CollectionModel
): string[] => {
  const { name } = collection
  const writes = collection.create || collection.edit
  return [
    listFunction(name),
    getFunction(name),
    ...(collection.create ? [createFunction(name)] : []),
    ...(collection.edit ? [updateFunction(name)] : []),
    ...(collection.delete ? [deleteFunction(name)] : []),
    ...collection.actions.map((action) => actionFunction(name, action.name)),
    ...collection.fields.flatMap((field) => [
      ...(writes && field.image ? [uploadFunction(name, field.name)] : []),
      ...(writes && field.input === 'relation'
        ? [optionsFunction(name, field.name)]
        : []),
    ]),
  ]
}
