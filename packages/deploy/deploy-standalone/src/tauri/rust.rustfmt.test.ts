import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { renderLibRs, renderMainRs, renderPikkuRs } from './rust.js'
import { resolveNativeApis } from './native.js'

/**
 * `rustfmt` parses the file before it formats it, so a clean `--check` is proof
 * the generated shell is syntactically valid Rust. It is not proof that it
 * type-checks — only `cargo build`, with the Tauri crates fetched, shows that.
 */
const rustfmtAvailable =
  spawnSync('rustfmt', ['--version'], { stdio: 'ignore' }).status === 0

const assertRustfmtClean = async (source: string, label: string) => {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-rs-'))
  const file = join(dir, 'shell.rs')
  try {
    await writeFile(file, source, 'utf-8')
    // lib.rs declares `mod pikku;`, and rustfmt follows it.
    await writeFile(
      join(dir, 'pikku.rs'),
      renderPikkuRs({ plugins: [], bundleServer: false }),
      'utf-8'
    )
    const result = spawnSync(
      'rustfmt',
      ['--edition', '2021', '--check', file],
      {
        encoding: 'utf-8',
      }
    )
    assert.equal(
      result.status,
      0,
      `rustfmt rejected the generated ${label}:\n${result.stdout}${result.stderr}`
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const cases: Array<[string, string]> = [
  ['main.rs', renderMainRs('shop-app')],
  ['lib.rs for a bundled UI', renderLibRs({ bundleServer: false })],
  ['lib.rs for a bundled server', renderLibRs({ bundleServer: true })],
  [
    'pikku.rs with no plugins',
    renderPikkuRs({ plugins: [], bundleServer: false }),
  ],
  [
    'pikku.rs with every kind of plugin',
    renderPikkuRs({
      plugins: resolveNativeApis(['store', 'biometric', 'dialog']),
      bundleServer: true,
    }),
  ],
]

describe('the generated shell as Rust source', () => {
  const skip = rustfmtAvailable ? false : 'rustfmt is not installed'

  for (const [label, source] of cases) {
    it(
      `${label} parses, and is already in rustfmt form`,
      { skip },
      async () => {
        await assertRustfmtClean(source, label)
      }
    )
  }
})
