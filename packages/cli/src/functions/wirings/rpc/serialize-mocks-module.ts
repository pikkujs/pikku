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

export const serializeMocksModule = (
  mocksFile: string,
  reactQueryImport: string,
  appMocksDir: string,
  addons: { namespace: string; dir: string }[]
) => `import { registerMocks } from '${reactQueryImport}'

export const registerPikkuMocks = () =>
  registerMocks([
${[source(mocksFile, appMocksDir), ...addons.map((addon) => source(mocksFile, addon.dir, addon.namespace))].join('\n')}
  ])
`
