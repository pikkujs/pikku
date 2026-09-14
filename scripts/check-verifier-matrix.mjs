#!/usr/bin/env node
// Every directory under verifiers/ must run in both workflows.
//
// The two matrices are maintained by hand and drifted: `scopes` and
// `feature-flags` were added to the Release matrix but not to the CI one, so
// they only ever ran after a merge — a store double that no longer satisfied
// its interface passed its pull request and turned main red on the release
// commit. Three more verifiers were in neither matrix and had never run at all.
//
// A verifier that runs its own dedicated job is listed in DEDICATED, which is
// the only way out of the matrix.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEDICATED = new Set(['binary', 'fullstack'])

const WORKFLOWS = [
  '.github/workflows/develop.yml',
  '.github/workflows/main.yml',
]

const matrixOf = (workflow) => {
  const source = readFileSync(join(ROOT, workflow), 'utf8')
  const list = source.match(/verifier:\s*\n?\s*\[([^\]]*)\]/)
  if (!list) {
    throw new Error(`${workflow}: no verifier matrix found`)
  }
  return new Set(
    list[1]
      .split('\n')
      .map((line) => line.trim().replace(/,$/, ''))
      .filter((entry) => entry && !entry.startsWith('#'))
  )
}

const verifiers = readdirSync(join(ROOT, 'verifiers'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => !DEDICATED.has(name))

const problems = []
for (const workflow of WORKFLOWS) {
  const matrix = matrixOf(workflow)
  for (const verifier of verifiers) {
    if (!matrix.has(verifier)) {
      problems.push(`${workflow} is missing the '${verifier}' verifier`)
    }
  }
  for (const entry of matrix) {
    if (!verifiers.includes(entry)) {
      problems.push(
        `${workflow} names '${entry}', which is not a verifiers/ directory`
      )
    }
  }
}

if (problems.length > 0) {
  console.error('Verifier matrices are out of step with verifiers/:\n')
  for (const problem of problems) {
    console.error(`  • ${problem}`)
  }
  console.error(
    '\nAdd the row to both matrices, or give the verifier its own job and list it in DEDICATED.'
  )
  process.exit(1)
}

console.log(`All ${verifiers.length} verifiers run in both workflows.`)
