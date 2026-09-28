import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { renderLibRs, renderMainRs, type MainRsOptions } from './main-rs.js'
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

const window = { windowTitle: 'Shop', width: 1200, height: 800 }

const libCases: Array<[string, MainRsOptions]> = [
  ['sidecar lib.rs', { sidecarName: 'shop', ...window }],
  [
    'sidecar lib.rs with native APIs',
    {
      sidecarName: 'shop',
      ...window,
      native: resolveNativeApis('dialog,store'),
    },
  ],
  ['remote lib.rs', { remoteUrl: 'https://shop.example.com', ...window }],
  [
    'remote lib.rs with native APIs',
    {
      remoteUrl: 'https://shop.example.com',
      ...window,
      native: resolveNativeApis('biometric,geolocation,haptics'),
    },
  ],
]

describe('the generated shell as Rust source', () => {
  const skip = rustfmtAvailable ? false : 'rustfmt is not installed'

  it('main.rs parses, and is already in rustfmt form', { skip }, async () => {
    await assertRustfmtClean(renderMainRs('shop-shell'), 'main.rs')
  })

  for (const [label, options] of libCases) {
    it(
      `${label} parses, and is already in rustfmt form`,
      { skip },
      async () => {
        await assertRustfmtClean(renderLibRs(options), label)
      }
    )
  }
})
