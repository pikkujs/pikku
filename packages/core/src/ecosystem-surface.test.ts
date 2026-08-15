import { test, describe } from 'node:test'
import * as assert from 'assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `@pikku/core` exports two doors onto the same modules: the curated
 * `ecosystem/*` facades, and the raw internal barrels (`./http` maps straight
 * to `dist/wirings/http/index.js`). Runtime adapters are the ecosystem tier —
 * they get the second door closed on them in a later breaking change, and
 * until then nothing should drift back onto it.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const runtimesDir = join(repoRoot, 'packages/runtimes')

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.ts')) out.push(path)
  }
  return out
}

const runtimeSourceFiles = () => {
  const files: string[] = []
  for (const pkg of readdirSync(runtimesDir)) {
    const src = join(runtimesDir, pkg, 'src')
    try {
      if (!statSync(src).isDirectory()) continue
    } catch {
      continue
    }
    walk(src, files)
  }
  return files
}

describe('ecosystem surface', () => {
  test('runtime adapters import core only through ecosystem', () => {
    const offenders: string[] = []

    for (const file of runtimeSourceFiles()) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        const match = line.match(/from\s+'(@pikku\/core(?:\/[^']*)?)'/)
        if (!match) return
        const specifier = match[1]!
        if (specifier.startsWith('@pikku/core/ecosystem')) return
        offenders.push(`${relative(repoRoot, file)}:${index + 1}  ${specifier}`)
      })
    }

    assert.deepStrictEqual(
      offenders,
      [],
      `Runtime adapters must import core through '@pikku/core/ecosystem/*'.\n` +
        `Reaching a raw subpath pulls in an internal barrel that is scheduled ` +
        `for deletion. If the name you need is missing from a facade, add it ` +
        `there — that is the deliberate act of making it public.\n\n` +
        offenders.join('\n')
    )
  })

  test('every ecosystem facade resolves', async () => {
    const facades = walk(join(repoRoot, 'packages/core/src/ecosystem'))
      .filter((f) => !f.endsWith('.test.ts'))
      .map((f) =>
        relative(join(repoRoot, 'packages/core/src/ecosystem'), f).replace(
          /\.ts$/,
          '.js'
        )
      )

    assert.ok(facades.length > 0, 'expected ecosystem facades to exist')

    for (const facade of facades) {
      await assert.doesNotReject(
        () => import(`./ecosystem/${facade}`),
        `ecosystem/${facade} failed to load`
      )
    }
  })
})
