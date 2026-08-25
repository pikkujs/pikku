import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { renderTauriNextSteps } from './next-steps.js'

describe('what to tell someone holding a freshly generated shell', () => {
  it('names the command that turns the crate into an app', () => {
    const lines = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: true,
    }).join('\n')

    assert.match(lines, /cd \/work\/shop\/src-tauri/)
    assert.match(lines, /tauri build/)
  })

  it('says a toolchain is missing rather than letting cargo say it', () => {
    // Generation is pure Node, so `--tauri` succeeds on a machine that cannot
    // build the result. Someone who has never used Tauri would otherwise find
    // out from a cargo error, at the point they least expect one.
    const lines = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: false,
    }).join('\n')

    assert.match(lines, /Rust/)
    assert.match(lines, /tauri\.app/)
  })

  it('stays quiet about prerequisites that are already met', () => {
    const lines = renderTauriNextSteps({
      shellDir: '/work/shop/src-tauri',
      hasRust: true,
    }).join('\n')

    assert.doesNotMatch(lines, /tauri\.app/)
  })
})
