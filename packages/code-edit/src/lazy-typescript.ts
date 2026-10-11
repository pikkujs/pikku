import { createRequire } from 'node:module'
import type TypeScript from 'typescript'

let loaded: typeof TypeScript | undefined

export const tsRuntime: typeof TypeScript = new Proxy({} as typeof TypeScript, {
  get: (_, key) => {
    loaded ??= createRequire(import.meta.url)('typescript') as typeof TypeScript
    return loaded[key as keyof typeof TypeScript]
  },
})
