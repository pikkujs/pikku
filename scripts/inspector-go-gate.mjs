#!/usr/bin/env node
// Decides whether a pull request should run the Go (inspector-go) job.
//
// That job compiles the standard library and typescript-go for every target, and
// four at once have run the runner out of disk, so it runs only when the package
// or what drives the job changed, or when the title asks with `[inspector-go]`.
// inspector-go-build is not gated: the parity jobs need its binaries. Full Suite
// runs this job on every push to main.
import { execFileSync } from 'node:child_process'

const GO_PATHS = [
  /^packages\/inspector-go\//,
  /^\.github\/workflows\/develop\.yml$/,
  /^scripts\/inspector-go-gate\.mjs$/,
]

export const hasMarker = (message = '') => /\[inspector-go\]/i.test(message)

export const touchesGo = (files = []) =>
  files.some((file) => GO_PATHS.some((pattern) => pattern.test(file)))

export const shouldRun = ({ message, files }) =>
  hasMarker(message) || touchesGo(files)

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const message = process.env.COMMIT_MESSAGE ?? ''
  let files
  try {
    const after = process.env.AFTER_SHA ?? 'HEAD'
    const base = git(['merge-base', 'origin/main', after]).trim()
    files = git(['diff', '--name-only', `${base}..${after}`])
      .split('\n')
      .filter(Boolean)
  } catch (error) {
    console.error(
      `Could not resolve the diff range, running the job: ${error.message}`
    )
  }
  const run = files === undefined || shouldRun({ message, files })
  console.error(
    run
      ? `Running Go (inspector-go) (${files === undefined ? 'no diff' : hasMarker(message) ? '[inspector-go] marker' : 'Go paths changed'}).`
      : 'Skipping Go (inspector-go): no [inspector-go] marker and no Go paths changed.'
  )
  console.log(`run=${run}`)
}
