import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serializeAddonInstallTypes } from './serialize-addon-types.js'

/**
 * `mcp` on a `wireAddon` names the addon's functions, so the names have to be
 * checked against the ones that addon actually publishes — a typo there is a
 * tool the app believes it offers and never does. The check is in the emitted
 * `#pikku/addon`, which is the only place that knows what is installed, so it
 * is the emitted file that gets compiled here.
 */
const CORE_ADDON_STUB = `
export type WireAddonConfig = {
  name: string
  package: string
  auth?: boolean
  mcp?: boolean | string[]
  tags?: string[]
}
export declare const wireAddon: (config: WireAddonConfig) => void
export declare const wireRemoteAddon: (config: WireAddonConfig) => void
`

const typeErrors = (consumer: string): string[] => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-addon-mcp-'))
  try {
    writeFileSync(join(dir, 'core-addon.ts'), CORE_ADDON_STUB)
    writeFileSync(
      join(dir, 'addon.ts'),
      serializeAddonInstallTypes({
        '@pikku/addon-todos': ['addTodo', 'listTodos', 'deleteTodo'],
        '@pikku/addon-slack': ['postMessage'],
      }).replaceAll("'@pikku/core/addon'", "'./core-addon.js'")
    )
    const file = join(dir, 'fixture.ts')
    writeFileSync(file, consumer)
    const program = ts.createProgram([file], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    })
    return ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file?.fileName === file)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('the tools an addon is offered to MCP under are typed', () => {
  test('a list of the addon’s own function names compiles', () => {
    const errors = typeErrors(`
import { wireAddon } from './addon.js'

wireAddon({
  name: 'todos',
  package: '@pikku/addon-todos',
  mcp: ['listTodos', 'addTodo'],
})
`)
    assert.deepEqual(errors, [])
  })

  test('a name the addon does not publish is refused', () => {
    const errors = typeErrors(`
import { wireAddon } from './addon.js'

wireAddon({
  name: 'todos',
  package: '@pikku/addon-todos',
  mcp: ['listTodos', 'postMessage'],
})
`)
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /postMessage/)
  })

  test('mcp: true still means every tool the addon declared', () => {
    const errors = typeErrors(`
import { wireAddon } from './addon.js'

wireAddon({ name: 'slack', package: '@pikku/addon-slack', mcp: true })
`)
    assert.deepEqual(errors, [])
  })

  test('an addon that is not installed falls back to unchecked names', () => {
    // The union only covers what this project installs. A package outside it
    // has no names to check against, and inventing an error there would fail a
    // wiring the inspector has simply not read yet.
    const errors = typeErrors(`
import { wireAddon } from './addon.js'

wireAddon({ name: 'x', package: '@scope/addon-unknown', mcp: ['whatever'] })
`)
    assert.deepEqual(errors, [])
  })

  test('the other install options still type-check through the wrapper', () => {
    const errors = typeErrors(`
import { wireAddon, wireRemoteAddon } from './addon.js'

wireAddon({
  name: 'todos',
  package: '@pikku/addon-todos',
  auth: true,
  tags: ['internal'],
})
wireRemoteAddon({ name: 'remote', package: '@pikku/addon-slack' })
`)
    assert.deepEqual(errors, [])
  })
})
