#!/usr/bin/env node
// A stand-in for the pi CLI in `-p --mode json` for piAgent tests. It never calls a model.
//
// Sessions are kept like pi keeps them: `<session-dir>/<stamp>_<id>.jsonl`, a `session` header line
// (id, cwd) and then one line per entry. A session holding a `corrupt` entry cannot be loaded.
//
// What a call does comes from FAKE_PI_SCRIPT, a JSON file holding one step per call (the call
// number is the count of lines already in FAKE_PI_LOG), or from a `[[fake:<mode>]]` marker in the
// message. Each call appends one JSON line to FAKE_PI_LOG with what it received.
//
// A step: { mode, writes?: { path: content }, commit?: subject, usage?: [{ input, output, cost }],
//           code?, error?, stderr?, child? }
//   ok        writes and commits, prints a turn as JSONL, exits 0 (or `code`)
//   exit      prints `stderr` and exits `code` (default 1)
//   error     prints a turn whose last assistant message ends with stopReason error, `error` as its
//             message, and exits 0, as pi does in json mode
//   hang      silent forever; with `child`, starts a child in its process group first
//   tool-hang starts a tool and never ends it
//   chatter   prints a line every 50 ms forever
import { spawn } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const flags = {}
const positional = []
const VALUED = new Set([
  '--mode',
  '--session-id',
  '--session-dir',
  '--provider',
  '--model',
  '--tools',
  '--skill',
  '--append-system-prompt',
  '-e',
])
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (VALUED.has(arg)) {
    ;(flags[arg] ??= []).push(argv[++i])
  } else if (arg.startsWith('-') && !arg.startsWith('---')) {
    flags[arg] = [true]
  } else positional.push(arg)
}
const one = (name) => flags[name]?.[0]

const fail = (message, code = 2) => {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}
for (const required of [
  '--mode',
  '--session-id',
  '--session-dir',
  '--provider',
  '--model',
])
  if (!one(required)) fail(`fake-pi: ${required} is required`)
if (one('--mode') !== 'json') fail('fake-pi: only --mode json')
if (!flags['-p'] && !flags['--print']) fail('fake-pi: only -p')

const files = positional
  .filter((arg) => arg.startsWith('@'))
  .map((a) => a.slice(1))
const message = positional.filter((arg) => !arg.startsWith('@')).join('\n')
const sessionId = one('--session-id')
const sessionDir = one('--session-dir')
const cwd = process.cwd()

const findSession = () => {
  if (!existsSync(sessionDir)) return undefined
  for (const file of readdirSync(sessionDir)) {
    if (!file.endsWith('.jsonl')) continue
    const path = join(sessionDir, file)
    try {
      const header = JSON.parse(readFileSync(path, 'utf8').split('\n')[0])
      if (
        header.type === 'session' &&
        header.id === sessionId &&
        resolve(header.cwd) === resolve(cwd)
      )
        return path
    } catch {
      // not a session
    }
  }
  return undefined
}

let sessionFile = findSession()
let history = []
if (sessionFile) {
  const entries = readFileSync(sessionFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  if (entries.some((entry) => entry.type === 'corrupt'))
    fail(`Error: Failed to load session ${sessionFile}: corrupt entry`, 1)
  history = entries
    .filter(
      (entry) => entry.type === 'message' && entry.message.role === 'user'
    )
    .map((entry) => entry.message.content)
} else {
  process.stderr.write(
    `Warning: No project session found with id '${sessionId}'; creating a new session with that id.\n`
  )
  mkdirSync(sessionDir, { recursive: true })
  sessionFile = join(sessionDir, `2026-11-23T00-00-00-000Z_${sessionId}.jsonl`)
  writeFileSync(
    sessionFile,
    `${JSON.stringify({ type: 'session', version: 3, id: sessionId, cwd })}\n`
  )
}
appendFileSync(
  sessionFile,
  `${JSON.stringify({ type: 'message', message: { role: 'user', content: message } })}\n`
)

const log = process.env.FAKE_PI_LOG
let call = 0
if (log && existsSync(log))
  call = readFileSync(log, 'utf8').split('\n').filter(Boolean).length
let step = {}
if (process.env.FAKE_PI_SCRIPT)
  step =
    JSON.parse(readFileSync(process.env.FAKE_PI_SCRIPT, 'utf8'))[call] ?? {}
const marker = /\[\[fake:([a-z-]+)\]\]/.exec(message)
if (marker) step = { ...step, mode: marker[1] }
const mode = step.mode ?? 'ok'

if (log) {
  mkdirSync(dirname(log), { recursive: true })
  appendFileSync(
    log,
    `${JSON.stringify({
      call,
      pid: process.pid,
      cwd,
      sessionId,
      sessionDir,
      provider: one('--provider'),
      model: one('--model'),
      tools: one('--tools') ?? null,
      skills: flags['--skill'] ?? [],
      systemPrompt: one('--append-system-prompt') ?? null,
      flags: Object.keys(flags).sort(),
      files,
      message,
      history,
      envKeys: Object.keys(process.env).sort(),
    })}\n`
  )
}

const print = (event) => process.stdout.write(`${JSON.stringify(event)}\n`)
const assistant = (usage, extra = {}) => ({
  type: 'message_end',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'working' }],
    usage: {
      input: usage.input ?? 0,
      output: usage.output ?? 0,
      cacheRead: usage.cacheRead ?? 0,
      cacheWrite: 0,
      totalTokens: (usage.input ?? 0) + (usage.output ?? 0),
      cost: { total: usage.cost ?? 0 },
    },
    stopReason: 'stop',
    ...extra,
  },
})

const git = (...args) =>
  new Promise((done) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.once('close', (code) =>
      code === 0 ? done() : fail(`fake-pi: git ${args.join(' ')}: ${stderr}`, 1)
    )
  })

print({ type: 'session', version: 3, id: sessionId, cwd })
print({ type: 'agent_start' })

switch (mode) {
  case 'ok': {
    print({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'write' })
    for (const [path, content] of Object.entries(step.writes ?? {})) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true })
      writeFileSync(join(cwd, path), content)
    }
    print({ type: 'tool_execution_end', toolCallId: 't1', isError: false })
    if (step.commit) {
      await git('add', '-A')
      await git('commit', '-q', '-m', step.commit)
    }
    for (const usage of step.usage ?? [{ input: 10, output: 2 }])
      print(assistant(usage))
    print({ type: 'agent_end' })
    process.exit(step.code ?? 0)
  }
  case 'exit':
    process.stderr.write(`${step.stderr ?? 'fake-pi: failed'}\n`)
    process.exit(step.code ?? 1)
  case 'error':
    print(assistant({ input: 5, output: 0 }))
    print(
      assistant(
        {},
        {
          stopReason: 'error',
          errorMessage: step.error ?? 'model error',
          content: [],
        }
      )
    )
    print({ type: 'agent_end' })
    process.exit(0)
  case 'hang':
    if (step.child) {
      const child = spawn(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        {
          stdio: 'ignore',
        }
      )
      if (process.env.FAKE_PI_PIDS)
        writeFileSync(
          process.env.FAKE_PI_PIDS,
          JSON.stringify([process.pid, child.pid])
        )
    }
    setInterval(() => {}, 1000)
    break
  case 'tool-hang':
    print({
      type: 'tool_execution_start',
      toolCallId: 'slow',
      toolName: 'bash',
    })
    setInterval(() => {}, 1000)
    break
  case 'chatter':
    setInterval(() => print({ type: 'message_update' }), 50)
    break
  default:
    fail(`fake-pi: unknown mode ${mode}`)
}
