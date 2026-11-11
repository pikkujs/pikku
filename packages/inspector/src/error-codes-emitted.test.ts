import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Guards against dead `ErrorCode` registry entries.
 *
 * Every value in the `ErrorCode` enum must have at least one emission site in
 * the framework source — a `ErrorCode.<NAME>` reference or the raw `PKU###`
 * string in a non-test `.ts` file under `packages/*​/src`, or its generated
 * constant (`diag.<CamelName>`) or raw code in the native inspector's Go and
 * embedded JavaScript source. A code that is
 * defined but never thrown is a dead entry: it can never appear in a user's
 * terminal, yet it still demands a docs page and clutters the registry. This
 * test fails and names any such entries so they get wired up or removed rather
 * than silently accumulating.
 */

const here = dirname(fileURLToPath(import.meta.url))
const packagesDir = join(here, '..', '..')
const errorCodesFile = join(here, 'error-codes.ts')

const enumMembers = [
  ...readFileSync(errorCodesFile, 'utf8').matchAll(
    /^\s*([A-Z0-9_]+)\s*=\s*'(PKU\d+)'/gm
  ),
].map((m) => ({ name: m[1], code: m[2] }))

const goSource = () => {
  const dir = join(packagesDir, 'inspector-go', 'internal')
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        (e.name.endsWith('.go') || e.name.endsWith('.js')) &&
        !e.name.endsWith('_test.go') &&
        e.name !== 'codes.gen.go'
    )
    .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'))
    .join('\n')
}

const goName = (name: string) =>
  name
    .split('_')
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join('')

const collectSource = () => {
  const contents: string[] = []
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    const srcDir = join(packagesDir, pkg.name, 'src')
    let entries
    try {
      entries = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const name = entry.name
      if (
        !name.endsWith('.ts') ||
        name.endsWith('.d.ts') ||
        name.endsWith('.test.ts') ||
        name === 'error-codes.ts'
      ) {
        continue
      }
      // Suites running in parallel may write a fixture into their own `src/`
      // and remove it between the listing and this read; a file that is gone
      // emits nothing.
      try {
        contents.push(readFileSync(join(entry.parentPath, name), 'utf8'))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }
  return contents.join('\n')
}

test('every ErrorCode value has an emission site in the source', () => {
  assert.ok(
    enumMembers.length > 0,
    'Failed to parse any ErrorCode members from error-codes.ts'
  )

  const source = collectSource()
  const go = goSource()

  const dead = enumMembers.filter(
    ({ name, code }) =>
      !source.includes(`ErrorCode.${name}`) &&
      !source.includes(code) &&
      !go.includes(code) &&
      !new RegExp(`\\b${goName(name)}\\b`).test(go)
  )

  assert.deepEqual(
    dead.map(({ code, name }) => `${code} ${name}`),
    [],
    `Dead ErrorCode entries (defined but never emitted). Wire them to a diagnostic or delete them:\n` +
      dead.map(({ code, name }) => `  - ${code} ${name}`).join('\n')
  )
})
