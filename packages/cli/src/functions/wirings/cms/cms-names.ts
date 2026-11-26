import type { CmsModelCollection } from './cms-model.types.js'

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

export const DESCRIBE_FUNCTION = 'describeCms'

export const listFunction = (collection: string) =>
  `listCms${pascal(collection)}`
export const getFunction = (collection: string) => `getCms${pascal(collection)}`
export const createFunction = (collection: string) =>
  `createCms${pascal(collection)}`
export const updateFunction = (collection: string) =>
  `updateCms${pascal(collection)}`
export const deleteFunction = (collection: string) =>
  `deleteCms${pascal(collection)}`
export const uploadFunction = (collection: string, field: string) =>
  `createCms${pascal(collection)}${pascal(field)}Upload`
export const actionFunction = (collection: string, action: string) =>
  `runCms${pascal(collection)}${pascal(action)}`
export const optionsFunction = (collection: string, field: string) =>
  `searchCms${pascal(collection)}${pascal(field)}Options`

/** Every function a collection gets, which is none for a disabled operation. */
export const cmsFunctionNames = (collection: CmsModelCollection): string[] => {
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
