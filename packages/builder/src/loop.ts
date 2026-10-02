import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { NO_DRIVER, lookAtPages, lookReport, type Critic } from './look.js'
import {
  SEATS,
  dispatchedMilestone,
  functionsDirFor,
  gherkinOf,
  personasIn,
  markDispatchedMilestoneBuilt,
  nextAction,
  planShortfall,
  readPikkuMeta,
  readPlan,
  recordNoteAttempt,
  renderPlanForBuild,
  setMilestoneStatus,
  type KnowledgeNote,
} from '@pikku/knowledge'

export interface GateResult {
  ok: boolean
  report: string
}

export type CommandRunner = (cwd: string, args: string[], env?: Record<string, string>) => Promise<{ code: number; output: string }>

export interface LoopOptions {
  apiUrl?: string
  env?: Record<string, string>
  run?: CommandRunner
  apps?: { slug: string; url: string }[]
  critic?: Critic
  onStatus?: (text: string) => void
}

export type LoopStep =
  | { kind: 'prompt'; status: string; message: string }
  | { kind: 'built'; status: string; commit?: string }
  | { kind: 'stop'; status: string | null }

const tail = (text: string, lines = 80) => text.trim().split('\n').slice(-lines).join('\n')

const pikkuBin = (cwd: string): string[] => {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', '.bin', 'pikku')
    if (existsSync(bin)) return [bin]
    if (dirname(dir) === dir) return ['npx', '--no', 'pikku']
  }
}

export const runPikku: CommandRunner = (cwd, args, env = {}) =>
  new Promise((resolve) => {
    const [command, ...prefix] = pikkuBin(cwd)
    const child = spawn(command!, [...prefix, ...args], { cwd, env: { ...process.env, ...env, FORCE_COLOR: '0' } })
    let output = ''
    child.stdout.on('data', (chunk) => (output = (output + chunk).slice(-40000)))
    child.stderr.on('data', (chunk) => (output = (output + chunk).slice(-40000)))
    child.once('error', (error) => resolve({ code: 1, output: error.message }))
    child.once('close', (code) => resolve({ code: code ?? 1, output }))
  })

const titleOf = (note: KnowledgeNote) => note.title ?? note.path

const git = (cwd: string, args: string[]) =>
  new Promise<{ code: number; output: string }>((resolve) => {
    const child = spawn('git', args, { cwd })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.once('error', (error) => resolve({ code: 1, output: error.message }))
    child.once('close', (code) => resolve({ code: code ?? 1, output: output.trim() }))
  })

export async function commitMilestone(cwd: string, title: string): Promise<string | undefined> {
  if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).code !== 0) return undefined
  await git(cwd, ['add', '-A', '--', '.', ':(exclude).pikku'])
  if ((await git(cwd, ['diff', '--cached', '--quiet'])).code === 0) return undefined
  const identity = (await git(cwd, ['config', 'user.email'])).code === 0 ? [] : ['-c', 'user.name=Pikku Studio', '-c', 'user.email=studio@pikku.dev']
  const commit = await git(cwd, [...identity, 'commit', '--no-verify', '-m', `Build "${title}"`])
  if (commit.code !== 0) throw new Error(`Could not commit "${title}": ${commit.output}`)
  return (await git(cwd, ['rev-parse', '--short', 'HEAD'])).output
}

export const budgetLine = (turn: number, max: number) =>
  max - turn < 5
    ? `Turn ${turn} of ${max} for this milestone. Few turns left: land what works and \`pikku knowledge plan defer\` what cannot be finished.`
    : `Turn ${turn} of ${max} for this milestone.`

const noteText = (cwd: string, note: KnowledgeNote) => {
  try {
    return readFileSync(join(cwd, note.path), 'utf8')
  } catch {
    return `(${note.path})`
  }
}

export async function checkMilestone(cwd: string, note: KnowledgeNote, options: LoopOptions = {}): Promise<GateResult> {
  const run = options.run ?? runPikku
  const verify = await run(cwd, ['verify'], options.env)
  if (verify.code !== 0) return { ok: false, report: `\`pikku verify\` is red:\n\n${tail(verify.output)}` }

  const plan = readPlan(cwd, note.path)
  if (plan.ok) {
    const shortfall = planShortfall(plan.plan, readPikkuMeta(functionsDirFor(cwd)))
    const owed = [...shortfall.missing, ...shortfall.problems]
    if (owed.length > 0) {
      return {
        ok: false,
        report: `The plan still owes ${owed.length} item(s) that pikku's generated meta cannot see:\n${owed.map((item) => `  - ${item}`).join('\n')}`,
      }
    }
  }

  const target = options.apiUrl ? ['--api-url', options.apiUrl] : ['--spawn']
  const scenarios = await run(cwd, ['scenario', 'run', 'local', ...target], options.env)
  if (scenarios.code !== 0) return { ok: false, report: `\`pikku scenario run\` failed:\n\n${tail(scenarios.output)}` }

  if (options.critic && options.apps?.length) {
    options.onStatus?.('Photographing the pages and grading their look')
    const gherkin = gherkinOf(note)
    try {
      const looks = await lookAtPages(cwd, {
        apps: options.apps,
        persona: gherkin ? personasIn(gherkin)[0] : undefined,
        milestone: note.path,
        run,
        env: options.env,
        critic: options.critic,
        onStatus: options.onStatus,
      })
      const ungraded = looks.filter((look) => look.verdict === 'ungraded').map((look) => look.route)
      if (ungraded.length) options.onStatus?.(`Could not grade the look of ${ungraded.join(', ')}; they are checked again next time`)
      const report = lookReport(looks)
      if (report) return { ok: false, report }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!NO_DRIVER.test(message)) return { ok: false, report: message }
      options.onStatus?.('Skipped the page look: this project has no @pikku/playwright')
    }
  }
  return { ok: true, report: tail(scenarios.output, 20) }
}

export const buildPrompt = (cwd: string, note: KnowledgeNote) => {
  const plan = readPlan(cwd, note.path)
  return [
    'A milestone of this app has been decided. Build it, following the pikku-build skill.',
    '',
    'Read the knowledge base first: the personas, scenarios, entities and decisions behind this milestone are written there and they are the spec.',
    '',
    noteText(cwd, note),
    ...(plan.ok
      ? [
          '',
          '---',
          '',
          renderPlanForBuild(plan.plan),
          '',
          'That plan is FIXED: build what it lists. If ONE item is genuinely impossible, `pikku knowledge plan defer <milestone> <item> --reason "<what you hit>"` moves it to a later pass.',
        ]
      : []),
    '',
    'You do not mark the milestone done. When you believe it works, end your turn: the builder then runs `pikku verify`, checks the plan against the generated meta and runs the scenarios. If anything is red it tells you exactly what, and you continue.',
  ].join('\n')
}

export const planPrompt = (cwd: string, note: KnowledgeNote) =>
  [
    'A milestone of this app has been decided and it has NO plan. Write the plan, following the pikku-architect skill. Do NOT write any of its code: the build turn that follows starts from your plan.',
    '',
    noteText(cwd, note),
    '',
    '---',
    '',
    `Send it with \`pikku knowledge plan set ${note.path} <file>\` (\`pikku knowledge plan schema\` shows the shape). It names the field that is wrong if it refuses. Once it is in, end your turn.`,
  ].join('\n')

export const repairPrompt = (note: KnowledgeNote, reason: string) =>
  [
    `The milestone note \`${note.path}\` cannot be built as written:`,
    '',
    reason,
    '',
    'Fix the NOTE, not the app, following the pikku-knowledge skill, then end your turn.',
  ].join('\n')

export const continuePrompt = (title: string, gate: GateResult) =>
  [
    `The checks for "${title}" did not pass yet:`,
    '',
    gate.report,
    '',
    'Fix every item listed in one batch, then end your turn and the builder checks again. Do not restart or re-scaffold anything that already exists.',
  ].join('\n')

export async function nextStep(cwd: string, options: LoopOptions = {}): Promise<LoopStep> {
  const building = await dispatchedMilestone(cwd)
  if (building) {
    const gate = await checkMilestone(cwd, building, options)
    if (!gate.ok) {
      return { kind: 'prompt', status: `Checks for "${titleOf(building)}" are not green yet`, message: continuePrompt(titleOf(building), gate) }
    }
    await markDispatchedMilestoneBuilt(cwd)
    const commit = await commitMilestone(cwd, titleOf(building))
    return { kind: 'built', status: `"${titleOf(building)}" is built and its checks pass${commit ? ` (saved as ${commit})` : ''}`, commit }
  }

  const action = await nextAction(cwd)
  if (action.kind === 'dispatch') {
    setMilestoneStatus(cwd, action.note.path, 'dispatched')
    return { kind: 'prompt', status: `Building "${titleOf(action.note)}"`, message: buildPrompt(cwd, action.note) }
  }
  if (action.kind === 'write-plan') {
    recordNoteAttempt(cwd, action.note, SEATS.planner)
    return { kind: 'prompt', status: `Planning "${titleOf(action.note)}"`, message: planPrompt(cwd, action.note) }
  }
  if (action.kind === 'repair-note') {
    recordNoteAttempt(cwd, action.note, SEATS.author)
    return { kind: 'prompt', status: `Fixing the note for "${titleOf(action.note)}"`, message: repairPrompt(action.note, action.reason) }
  }
  if (action.kind === 'ask-user') {
    recordNoteAttempt(cwd, action.note, SEATS.user)
    return { kind: 'stop', status: action.question.question }
  }
  if (action.kind === 'hold') return { kind: 'stop', status: action.reason }
  return { kind: 'stop', status: null }
}
