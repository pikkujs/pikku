import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { renderMainRs } from './main-rs.js'

/**
 * `rustfmt` parses the file before it formats it, so a clean `--check` is proof
 * the generated shell is syntactically valid Rust. It is not proof that it
 * type-checks — only `cargo build`, with the Tauri crates fetched, shows that.
 */
const rustfmtAvailable =
  spawnSync('rustfmt', ['--version'], { stdio: 'ignore' }).status === 0

describe('the generated main.rs as Rust source', () => {
  it(
    'parses, and is already in rustfmt form',
    { skip: rustfmtAvailable ? false : 'rustfmt is not installed' },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'pikku-mainrs-'))
      const file = join(dir, 'main.rs')
      try {
        await writeFile(
          file,
          renderMainRs({
            sidecarName: 'shop',
            windowTitle: 'Shop',
            width: 1200,
            height: 800,
          }),
          'utf-8'
        )

        const result = spawnSync(
          'rustfmt',
          ['--edition', '2021', '--check', file],
          { encoding: 'utf-8' }
        )
        assert.equal(
          result.status,
          0,
          `rustfmt rejected the generated shell:\n${result.stdout}${result.stderr}`
        )
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
  )
})
