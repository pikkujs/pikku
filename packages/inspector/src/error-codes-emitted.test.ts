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
 * string in a non-test `.ts` file under `packages/*​/src`. A code that is
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
      contents.push(readFileSync(join(entry.parentPath, name), 'utf8'))
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

  const dead = enumMembers.filter(
    ({ name, code }) =>
      !source.includes(`ErrorCode.${name}`) && !source.includes(code)
  )

  assert.deepEqual(
    dead.map(({ code, name }) => `${code} ${name}`),
    [],
    `Dead ErrorCode entries (defined but never emitted). Wire them to a diagnostic or delete them:\n` +
      dead.map(({ code, name }) => `  - ${code} ${name}`).join('\n')
  )
})
