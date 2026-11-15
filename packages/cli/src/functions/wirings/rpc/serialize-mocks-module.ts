import { existsSync } from 'node:fs'
import { dirname, relative, sep } from 'node:path'

const globBase = (fromFile: string, dir: string) => {
  const rel = relative(dirname(fromFile), dir).split(sep).join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

const source = (fromFile: string, dir: string, namespace?: string) => {
  const base = globBase(fromFile, dir)
  const exhaustive = base.includes('node_modules') ? ', exhaustive: true' : ''
  return `    {${namespace ? ` namespace: ${JSON.stringify(namespace)},` : ''}
      files: import.meta.glob('${base}/*/*.json', { import: 'default'${exhaustive} }),
      meta: import.meta.glob('${base}/*/*.meta.json', { eager: true, import: 'default'${exhaustive} }),
    },`
}

export const mocksToGlob = <Addon extends { dir: string }>(
  appMocksDir: string,
  addons: Addon[]
): { app: boolean; addons: Addon[] } | undefined => {
  const app = existsSync(appMocksDir)
  const withMocks = addons.filter((addon) => existsSync(addon.dir))
  return app || withMocks.length ? { app, addons: withMocks } : undefined
}

/** The exposed RPC names whose function is declared `mock: true`, sorted. */
export const mockFlaggedNames = (
  exposedMeta: Record<string, string>,
  functionsMeta: Record<string, { mock?: boolean } | undefined>
): string[] =>
  Object.entries(exposedMeta)
    .filter(([, pikkuFuncId]) => functionsMeta[pikkuFuncId]?.mock === true)
    .map(([name]) => name)
    .sort()

export const serializeMocksModule = (
  mocksFile: string,
  reactQueryImport: string,
  appMocksDir: string,
  addons: { namespace: string; dir: string }[],
  app = true,
  flagged: string[] = []
) => `import { registerMocks } from '${reactQueryImport}'
import { createMockPikkuClient, type MockPikkuOptions } from '${reactQueryImport}'

export { setMockScenario, setMockScenarios, clearMockScenarios, resetMockQueries, mockResponse } from '${reactQueryImport}'
export type { MockPikkuOptions, MockScenarioMeta } from '${reactQueryImport}'

/** The functions declared \`mock: true\`: the ones \`createMockPikku\` mocks in \`flagged\` mode. */
export const mockFlagged: ReadonlySet<string> = new Set<string>(${JSON.stringify(flagged)})

export const registerPikkuMocks = () =>
  registerMocks([
${[...(app ? [source(mocksFile, appMocksDir)] : []), ...addons.map((addon) => source(mocksFile, addon.dir, addon.namespace))].join('\n')}
  ])

/**
 * A Pikku instance for \`PikkuProvider\` that answers from \`.mocks/\`. Without
 * \`fallback\` every call is mocked; with one, only the functions in
 * \`mockFlagged\` are, and everything else goes to the fallback.
 */
export const createMockPikku = (options?: MockPikkuOptions) => {
  registerPikkuMocks()
  return createMockPikkuClient(mockFlagged, options)
}
`
