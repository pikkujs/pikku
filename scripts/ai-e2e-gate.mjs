#!/usr/bin/env node
// Decides whether a push should run the live-model e2e scenarios.
//
// They cost real OpenRouter tokens and about twenty minutes, so running them on
// every branch push is what got the job parked in the first place. They are
// also the only coverage the agent runner has, so never running them is worse.
//
// The gate is therefore two signals, either of which is enough: an `[ai]` marker
// the author writes into the commit message, and a change under one of the
// trees the live scenarios actually exercise. The marker is a bracketed token
// rather than the bare word because "ai" is a substring of maintain, again,
// detail and available — a plain `contains()` would fire on almost every commit.
import { execFileSync } from 'node:child_process'

const AI_PATHS = [
  /^packages\/core\/src\/wirings\/agent(-scorer)?\//,
  /^packages\/services\/ai-/,
  /^packages\/voice-agents\//,
  /^packages\/assistant-ui\//,
  /^e2e\/packages\/functions\/src\/agents\//,
  /^e2e\/packages\/functions\/tests\/scenarios\/.*(agent|converse|voice)/,
  /^\.github\/workflows\/develop\.yml$/,
  /^scripts\/ai-e2e-gate\.mjs$/,
]

export const hasMarker = (message = '') => /\[ai\]/i.test(message)

export const touchesAI = (files = []) =>
  files.some((file) => AI_PATHS.some((pattern) => pattern.test(file)))

export const shouldRun = ({ message, files }) =>
  hasMarker(message) || touchesAI(files)

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

const changedFiles = (before, after) => {
  const base =
    before && !/^0+$/.test(before)
      ? before
      : git(['merge-base', 'origin/main', after]).trim()
  return git(['diff', '--name-only', `${base}..${after}`])
    .split('\n')
    .filter(Boolean)
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const message = process.env.COMMIT_MESSAGE ?? ''
  let files = []
  try {
    files = changedFiles(
      process.env.BEFORE_SHA,
      process.env.AFTER_SHA ?? 'HEAD'
    )
  } catch (error) {
    console.error(
      `Could not resolve the diff range, gating on the message alone: ${error.message}`
    )
  }
  const run = shouldRun({ message, files })
  console.error(
    run
      ? `Running the live AI e2e scenarios (${hasMarker(message) ? '[ai] marker' : 'AI paths changed'}).`
      : 'Skipping the live AI e2e scenarios: no [ai] marker and no AI paths changed.'
  )
  console.log(`run=${run}`)
}
