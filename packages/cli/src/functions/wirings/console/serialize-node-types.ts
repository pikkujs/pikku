export const serializeNodeTypes = (
  rpcMapImportPath: string,
  categories: string[] | undefined
) => {
  const categoryType = categories?.length
    ? categories.map((c) => `'${c}'`).join(' | ')
    : 'never'

  return `import type { FlattenedRPCMap } from '${rpcMapImportPath}'

export type NodeCategory = ${categoryType}

export type NodeRPCName = keyof FlattenedRPCMap
`
}
