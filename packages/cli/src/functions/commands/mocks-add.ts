import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { added, changed, dim, removed } from '../../utils/output.js'
import {
  addFlagToSource,
  flagEntry,
  planAddMock,
  stubHookCall,
  unknownRpcMessage,
  type AddMockInput,
} from '../mocks/add.js'
import { addonHasFunction, readDeclaredFlags } from '../mocks/run-check.js'
import { readAddonsMeta } from '../mocks/addon-mocks.js'
import { findFunction } from '../mocks/diff.js'
import { loadSurface } from '../mocks/load.js'
import { MOCKS_DIR, readMocks } from '../mocks/read.js'
import type { ContractChange } from '../mocks/contract.js'

export interface MocksAddResult {
  rpc: string
  dir: string
  /** Files written, relative to the project root. */
  files: string[]
  name: string
  state: string
  default: boolean
  /** Mocks of this RPC that stopped being the default. */
  clearedDefault: string[]
  replaced: boolean
  hook: string
  flag?: {
    name: string
    /** declared: already in the project; added: written to `file`; manual: add `snippet` yourself. */
    status: 'declared' | 'added' | 'manual'
    file?: string
    snippet?: string
    reason?: string
  }
  shape: {
    checked: boolean
    invalid: string[]
    changes: ContractChange[]
  }
  warnings: string[]
}

/** The file that declares the project's flags: one of a declared flag's own, else a conventional spot. Never a file outside the project. */
const flagSourceFile = (
  rootDir: string,
  pikkuDir: string,
  srcDirectories: string[] = []
): string | undefined => {
  const inside = (file: string) => {
    const rel = relative(rootDir, file)
    return !rel.startsWith('..') && !isAbsolute(rel)
  }
  const candidates: string[] = []
  try {
    const meta = JSON.parse(
      readFileSync(
        join(pikkuDir, 'scopes', 'pikku-flags-meta.gen.json'),
        'utf8'
      )
    ) as Record<string, { sourceFile?: string }>
    for (const entry of Object.values(meta)) {
      if (entry.sourceFile) candidates.push(entry.sourceFile)
    }
  } catch {
    // no flags declared yet
  }
  for (const dir of srcDirectories) {
    candidates.push(join(dir, 'flags.ts'), join(dir, 'definitions', 'flags.ts'))
  }
  candidates.push(join(rootDir, 'packages/functions/src/flags.ts'))
  return candidates.find(
    (file) =>
      inside(file) &&
      existsSync(file) &&
      readFileSync(file, 'utf8').includes('defineFeatureFlags(')
  )
}

export const mocksAdd = pikkuSessionlessFunc<
  Omit<AddMockInput, 'data'> & { from?: string },
  MocksAddResult
>({
  description:
    'Add a mock for an RPC: validates the RPC, writes .mocks/<rpc.name>/<state>.json and .meta.json, makes it the default when it is the first, and optionally declares the feature flag',
  func: async ({ config }, input) => {
    const { rootDir, outDir } = config
    const target = input.rpc
    if (!target)
      throw new Error(
        'Give the RPC to mock, such as pikku mocks add classes:month'
      )
    const surface = loadSurface(rootDir, outDir)
    const pikkuDir = resolve(rootDir, outDir)
    const known = !!findFunction(surface, target)
    if (!known && !addonHasFunction(readAddonsMeta(pikkuDir), target)) {
      throw new Error(unknownRpcMessage(surface, target))
    }
    let data: { value: unknown } | undefined
    if (input.from !== undefined) {
      const path = resolve(process.cwd(), input.from)
      if (!existsSync(path)) throw new Error(`--from file not found: ${path}`)
      try {
        data = { value: JSON.parse(await readFile(path, 'utf8')) }
      } catch (error) {
        throw new Error(
          `--from ${input.from} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    const existing =
      (await readMocks(rootDir)).find((entry) => entry.rpc === target)?.mocks ??
      []
    const { from: _from, ...rest } = input
    const plan = planAddMock({ ...rest, data }, surface, existing, known)

    const dir = join(rootDir, MOCKS_DIR, target.replaceAll(':', '.'))
    await mkdir(dir, { recursive: true })
    const files: string[] = []
    const write = async (file: string, value: unknown) => {
      await writeFile(join(dir, file), JSON.stringify(value, null, 2) + '\n')
      files.push(relative(rootDir, join(dir, file)))
    }
    for (const other of plan.clearDefault) {
      const metaPath = join(dir, `${other}.meta.json`)
      let raw: Record<string, unknown> = {}
      if (existsSync(metaPath)) {
        try {
          raw = JSON.parse(await readFile(metaPath, 'utf8'))
        } catch {
          plan.warnings.push(
            `${other}.meta.json is not valid JSON, so its default flag was left alone`
          )
          continue
        }
      }
      raw.default = false
      await writeFile(metaPath, JSON.stringify(raw, null, 2) + '\n')
    }
    await write(`${plan.name}.json`, plan.data)
    await write(`${plan.name}.meta.json`, plan.meta)

    const result: MocksAddResult = {
      rpc: target,
      dir: relative(rootDir, dir),
      files,
      name: plan.name,
      state: plan.state,
      default: plan.meta.default === true,
      clearedDefault: plan.clearDefault,
      replaced: plan.replaces,
      hook: stubHookCall(plan.hook, target, input.flag),
      shape: plan.shape,
      warnings: plan.warnings,
    }

    if (input.flag) {
      const flag = input.flag
      const description = `Sample data for ${target}`
      if (readDeclaredFlags(pikkuDir).includes(flag)) {
        result.flag = { name: flag, status: 'declared' }
      } else {
        const file = flagSourceFile(rootDir, pikkuDir, config.srcDirectories)
        const snippet = flagEntry(flag, description).trimEnd()
        const source = file ? await readFile(file, 'utf8') : undefined
        const next =
          file && source !== undefined
            ? addFlagToSource(source, flag, description)
            : null
        if (file && next !== null) {
          await writeFile(file, next)
          result.flag = {
            name: flag,
            status: 'added',
            file: relative(rootDir, file),
            snippet,
          }
        } else {
          result.flag = {
            name: flag,
            status: 'manual',
            ...(file ? { file: relative(rootDir, file) } : {}),
            snippet,
            reason: file
              ? 'could not find a defineFeatureFlags({ ... }) call to extend'
              : 'no flags file found (looked for the file of a declared flag and packages/functions/src/flags.ts)',
          }
        }
      }
    }
    return result
  },
})

export const renderMocksAdd = (
  _services: unknown,
  result: MocksAddResult
): void => {
  console.log(
    `${added('+')} ${result.rpc}  ${dim(`${result.state} mock ${result.replaced ? 'replaced' : 'added'}${result.default ? ', default' : ''}`)}`
  )
  for (const file of result.files) console.log(`     ${dim(file)}`)
  for (const name of result.clearedDefault)
    console.log(
      `     ${changed('~')} ${dim(`${name} is no longer the default`)}`
    )
  if (result.flag) {
    const { name, status, file, snippet, reason } = result.flag
    if (status === 'declared') {
      console.log(`     ${dim(`flag ${name} is already declared`)}`)
    } else if (status === 'added') {
      console.log(`     ${added('+')} ${dim(`flag ${name} added to ${file}`)}`)
    } else {
      console.log(
        `     ${changed('⚠')} ${dim(`flag ${name} not declared: ${reason}. Add this to the defineFeatureFlags({ ... }) object${file ? ` in ${file}` : ''}:`)}`
      )
      for (const line of snippet!.split('\n')) console.log(`         ${line}`)
    }
  }
  console.log()
  console.log(`Use:  ${result.hook}`)
  if (!result.flag) {
    console.log(
      dim(
        "Without { featureFlag: '<flag>' } the stub works in development but cannot be published; pass --flag <name> to declare one."
      )
    )
  }
  const { shape } = result
  if (shape.invalid.length || shape.changes.length) {
    console.log()
    for (const error of shape.invalid)
      console.log(`${removed('✗')} ${dim(error)}`)
    for (const change of shape.changes)
      console.log(`${changed('~')} ${dim(`${change.path}: ${change.kind}`)}`)
    console.log(
      dim(
        'The body does not match the function output. That is fine for a stub of data the function does not return yet; pikku mocks diff reports it, and pikku mocks sync refuses a mock the function rejects.'
      )
    )
  } else if (shape.checked) {
    console.log(dim('Body matches the function output.'))
  } else {
    console.log(
      dim(
        'Body not checked against a function output; pikku mocks diff and pikku mocks check will.'
      )
    )
  }
  for (const warning of result.warnings)
    console.log(`${changed('⚠')} ${dim(warning)}`)
  console.log(
    dim(
      'Next: pikku mocks sync to record the shape; pikku mocks check before publishing.'
    )
  )
}
