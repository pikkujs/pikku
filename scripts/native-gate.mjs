#!/usr/bin/env node
// Decides whether a pull request should build and smoke-test the native apps.
//
// Those jobs compile Rust, run Gradle and boot an Android emulator and an iOS
// simulator — the better part of half an hour of runners — so they run only
// when something they exercise changed, or when the title asks with `[native]`.
// A bracketed token for the same reason as the AI gate's: "native" alone turns
// up in ordinary titles.
import { execFileSync } from 'node:child_process'

const NATIVE_PATHS = [
  /^packages\/deploy\/deploy-standalone\/src\/tauri\//,
  /^packages\/cli\/src\/functions\/app\//,
  /^packages\/cli\/src\/functions\/commands\/app\.ts$/,
  /^e2e\/packages\/web\//,
  /^e2e\/pikku\.config\.json$/,
  /^\.github\/workflows\/develop\.yml$/,
  /^scripts\/native-(gate|smoke)\.mjs$/,
]

export const hasMarker = (message = '') => /\[native\]/i.test(message)

export const touchesNative = (files = []) =>
  files.some((file) => NATIVE_PATHS.some((pattern) => pattern.test(file)))

export const shouldRun = ({ message, files }) =>
  hasMarker(message) || touchesNative(files)

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const message = process.env.COMMIT_MESSAGE ?? ''
  let files = []
  try {
    const after = process.env.AFTER_SHA ?? 'HEAD'
    const base = git(['merge-base', 'origin/main', after]).trim()
    files = git(['diff', '--name-only', `${base}..${after}`])
      .split('\n')
      .filter(Boolean)
  } catch (error) {
    console.error(
      `Could not resolve the diff range, gating on the message alone: ${error.message}`
    )
  }
  const run = shouldRun({ message, files })
  console.error(
    run
      ? `Building the native apps (${hasMarker(message) ? '[native] marker' : 'native paths changed'}).`
      : 'Skipping the native apps: no [native] marker and no native paths changed.'
  )
  console.log(`run=${run}`)
}
