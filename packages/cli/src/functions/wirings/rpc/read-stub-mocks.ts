import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export type StubMock = { name: string; outputType: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const typeOfSamples = (samples: unknown[]): string => {
  if (samples.length === 0) return 'unknown'
  const kinds = new Set<string>()
  const objects = samples.filter(isRecord)
  const arrays = samples.filter(Array.isArray) as unknown[][]
  for (const sample of samples) {
    if (sample === null) kinds.add('null')
    else if (isRecord(sample) || Array.isArray(sample)) continue
    else
      kinds.add(
        typeof sample === 'number'
          ? 'number'
          : typeof sample === 'boolean'
            ? 'boolean'
            : 'string'
      )
  }
  if (objects.length) {
    const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))]
    const props = keys.map((key) => {
      const present = objects.filter((o) => key in o).map((o) => o[key])
      const optional = present.length < objects.length ? '?' : ''
      return `${JSON.stringify(key)}${optional}: ${typeOfSamples(present)}`
    })
    kinds.add(`{ ${props.join('; ')} }`)
  }
  if (arrays.length) {
    const elements = arrays.flat()
    const element = elements.length ? typeOfSamples(elements) : 'unknown'
    kinds.add(`Array<${element}>`)
  }
  return [...kinds].sort().join(' | ')
}

export const inferMockType = typeOfSamples

const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}

type Scenario = { sample?: unknown; error: boolean }

const readScenarios = async (
  mocksDir: string,
  rpcOf: (dir: string) => string,
  labelOf: (dir: string) => string,
  into: Map<string, Map<string, Scenario>>,
  labels: Map<string, string>
) => {
  let dirs: string[]
  try {
    dirs = (await readdir(mocksDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return
  }
  for (const dir of dirs) {
    const files = (await readdir(join(mocksDir, dir))).filter(
      (file) => file.endsWith('.json') && !file.endsWith('.meta.json')
    )
    if (!files.length) continue
    const scenarios = into.get(rpcOf(dir)) ?? new Map<string, Scenario>()
    for (const file of files) {
      const meta = (await readJson(
        join(mocksDir, dir, file.replace(/\.json$/, '.meta.json'))
      )) as { state?: string; status?: number } | undefined
      const error = meta?.state === 'error' || (meta?.status ?? 200) >= 400
      scenarios.set(file, {
        error,
        sample: error ? undefined : await readJson(join(mocksDir, dir, file)),
      })
    }
    into.set(rpcOf(dir), scenarios)
    labels.set(rpcOf(dir), labelOf(dir))
  }
}

export const readStubMocks = async (
  mocksDir: string,
  addons: { namespace: string; package: string; dir: string }[] = []
): Promise<StubMock[]> => {
  const rpcs = new Map<string, Map<string, Scenario>>()
  const labels = new Map<string, string>()
  for (const addon of addons) {
    await readScenarios(
      addon.dir,
      (dir) => `${addon.namespace}:${dir}`,
      (dir) => `${addon.package}/.mocks/${dir}`,
      rpcs,
      labels
    )
  }
  await readScenarios(
    mocksDir,
    (dir) => dir.replace(/\./g, ':'),
    (dir) => `.mocks/${dir}`,
    rpcs,
    labels
  )
  const stubs: StubMock[] = []
  for (const name of [...rpcs.keys()].sort()) {
    const samples = [...rpcs.get(name)!.values()]
      .filter((scenario) => !scenario.error && scenario.sample !== undefined)
      .map((scenario) => scenario.sample)
    if (samples.length) {
      stubs.push({ name, outputType: typeOfSamples(samples) })
    } else {
      throw new Error(
        `${labels.get(name)} has only error mocks, so its stub has no type. Add a healthy mock and mark it default (meta: { "state": "healthy", "default": true }).`
      )
    }
  }
  return stubs
}
