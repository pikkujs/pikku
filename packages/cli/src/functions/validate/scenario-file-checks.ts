import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readTextSafe } from './shared-checks.js'
import type { ValidateFinding } from './persona-checks.js'

/**
 * The declarations that must live in a dedicated scenario file.
 *
 * Matched on the call, not the import, so a re-export or an aliased import does
 * not slip past — and a file that only mentions the name in a comment or a
 * string does not get flagged.
 */
const SCENARIO_DECLARATIONS = [
  'pikkuScenario',
  'pikkuFeature',
  'pikkuScenarioStep',
  'pikkuPlatformScenarioStep',
  'pikkuAddonScenarioStep',
] as const

/**
 * A file allowed to declare them.
 *
 * Three suffixes rather than one because the split that matters is scenarios
 * apart from application code, not a particular spelling: `.scenario.ts` and
 * `.scenarios.ts` hold the scenarios, `.steps.ts` holds the steps they call.
 */
const SCENARIO_FILE = /\.(scenario|scenarios|steps)\.tsx?$/

/**
 * The declarations that make up a virtual user, and where they live.
 *
 * There is no `defineVirtualUsers` to look for — that name was retired in
 * favour of `definePersonas`, because a virtual user is derived rather than
 * authored: the function meta becomes its catalogue, the scenario meta becomes
 * its intents, and the declared personas become its identities. So the thing a
 * project actually writes is the persona list, and that is what has to be
 * findable by filename.
 */
const VIRTUAL_USER_DECLARATIONS = ['definePersonas', 'runVirtualUser'] as const

const VIRTUAL_USER_FILE = /\.(virtual-user|vu)\.tsx?$/

/**
 * The declarations that grade an agent, and where they live.
 *
 * A scorer is a test of the agent that is also shipped, which is exactly why it
 * needs its own file rather than sitting beside the agent it grades: the two
 * are edited for opposite reasons, and a rubric buried in an agent definition
 * is one nobody reviews as a rubric.
 */
const SCORER_DECLARATIONS = ['pikkuAIScorer', 'pikkuAIJudge'] as const

const SCORER_FILE = /\.scorers?\.tsx?$/

const isGenerated = (path: string): boolean =>
  path.includes('.gen.') || path.includes(`${'/'}.pikku${'/'}`)

const listSourceFiles = async (dir: string): Promise<string[]> => {
  if (!existsSync(dir)) return []
  try {
    return (await readdir(dir, { recursive: true }))
      .filter(
        (f): f is string =>
          typeof f === 'string' &&
          (f.endsWith('.ts') || f.endsWith('.tsx')) &&
          !f.includes('node_modules')
      )
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

/**
 * Scenarios, features and steps live in files named for what they are.
 *
 * A `pikkuScenario` declared next to the functions it exercises reads as more
 * of the same file — the wiring, the function and the test of the function all
 * in one scroll — and the scenario is the part that gets lost. Keeping them in
 * `*.scenario.ts` / `*.scenarios.ts` / `*.steps.ts` means a file's name tells
 * you whether it ships or whether it tests, before you open it.
 *
 * An error rather than a warning: the mixing is only cheap to undo while it is
 * one file, and every project that let it slide ended up with scenarios spread
 * across dozens.
 *
 * knowledge: decisions/internals/scenarios-live-in-files-named-for-them.md
 */
export const runScenarioFileChecks = async (
  root: string,
  srcDirectories: string[]
): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = []
  const dirs = srcDirectories.length
    ? srcDirectories
    : [join('packages', 'functions', 'src')]

  const files = (
    await Promise.all(dirs.map((dir) => listSourceFiles(join(root, dir))))
  ).flat()

  for (const file of files) {
    if (SCENARIO_FILE.test(file) || isGenerated(file)) continue
    const text = await readTextSafe(file)
    if (!text) continue

    const used = SCENARIO_DECLARATIONS.filter((name) =>
      new RegExp(`\\b${name}\\s*\\(`).test(text)
    )
    if (used.length === 0) continue

    const rel = relative(root, file)
    const suggested = rel.replace(/\.tsx?$/, (ext) => `.scenarios${ext}`)
    findings.push({
      id: 'scenario-declared-outside-scenario-file',
      severity: 'error',
      message: `${rel} declares ${used.join(', ')} — scenarios, features and steps must live in a *.scenario.ts, *.scenarios.ts or *.steps.ts file, not mixed into application code`,
      path: file,
      fixHint: [
        `Move the ${used.length === 1 ? 'declaration' : 'declarations'} into a dedicated file, e.g.:`,
        `  ${suggested}`,
        'Steps belong in *.steps.ts; the scenarios that call them in *.scenarios.ts.',
        'Keeping them apart is what lets a file name say whether it ships or tests.',
      ].join('\n'),
    })
  }

  for (const file of files) {
    if (VIRTUAL_USER_FILE.test(file) || isGenerated(file)) continue
    const text = await readTextSafe(file)
    if (!text) continue

    const used = VIRTUAL_USER_DECLARATIONS.filter((name) =>
      new RegExp(`\\b${name}\\s*\\(`).test(text)
    )
    if (used.length === 0) continue

    const rel = relative(root, file)
    findings.push({
      id: 'virtual-user-declared-outside-virtual-user-file',
      severity: 'error',
      message: `${rel} declares ${used.join(', ')} — the personas a virtual user plays must live in a *.virtual-user.ts (or *.vu.ts) file, not mixed into application code`,
      path: file,
      fixHint: [
        'Move the declaration into a dedicated file, e.g.:',
        `  ${rel.replace(/[^/\\]+$/, 'personas.virtual-user.ts')}`,
        'A virtual user is derived from what the project already generates —',
        'the personas are the only part it authors, so they get their own file.',
      ].join('\n'),
    })
  }

  for (const file of files) {
    if (SCORER_FILE.test(file) || isGenerated(file)) continue
    const text = await readTextSafe(file)
    if (!text) continue

    const used = SCORER_DECLARATIONS.filter((name) =>
      new RegExp(`\\b${name}\\s*\\(`).test(text)
    )
    if (used.length === 0) continue

    const rel = relative(root, file)
    findings.push({
      id: 'scorer-declared-outside-scorer-file',
      severity: 'error',
      message: `${rel} declares ${used.join(', ')} — scorers and judges must live in a *.scorer.ts file, not mixed into application code`,
      path: file,
      fixHint: [
        'Move the declaration into a dedicated file, e.g.:',
        `  ${rel.replace(/[^/\\]+$/, 'grading.scorer.ts')}`,
        'A scorer grades the agent it sits next to, and is edited for the',
        'opposite reason — keeping it separate is what keeps it reviewable.',
      ].join('\n'),
    })
  }

  return findings
}
