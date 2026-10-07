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
    else kinds.add(typeof sample === 'number' ? 'number' : typeof sample === 'boolean' ? 'boolean' : 'string')
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

export const readStubMocks = async (mocksDir: string): Promise<StubMock[]> => {
  let dirs: string[]
  try {
    dirs = (await readdir(mocksDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
  const stubs: StubMock[] = []
  for (const dir of dirs.sort()) {
    const files = (await readdir(join(mocksDir, dir))).filter(
      (file) => file.endsWith('.json') && !file.endsWith('.meta.json')
    )
    const samples: unknown[] = []
    for (const file of files) {
      const meta = (await readJson(join(mocksDir, dir, file.replace(/\.json$/, '.meta.json')))) as
        | { state?: string; status?: number }
        | undefined
      if (meta?.state === 'error' || (meta?.status ?? 200) >= 400) continue
      const data = await readJson(join(mocksDir, dir, file))
      if (data !== undefined) samples.push(data)
    }
    if (samples.length) stubs.push({ name: dir.replace(/\./g, ':'), outputType: typeOfSamples(samples) })
  }
  return stubs
}
