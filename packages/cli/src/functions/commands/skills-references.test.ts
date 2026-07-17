import assert from 'node:assert'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import ts from 'typescript'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..', '..', '..')
const skillsDir = join(packageRoot, 'skills')
const wiringPath = join(packageRoot, 'src', 'cli.wiring.ts')
const secretServicePath = join(
  packageRoot,
  '..',
  'core',
  'src',
  'services',
  'secret-service.ts'
)

function parse(path: string): ts.SourceFile {
  assert.ok(existsSync(path), `expected to find ${path}`)
  return ts.createSourceFile(
    path,
    readFileSync(path, 'utf-8'),
    ts.ScriptTarget.Latest,
    true
  )
}

function propertyNamed(
  object: ts.ObjectLiteralExpression,
  name: string
): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) &&
      p.name.getText().replace(/['"]/g, '') === name
  )
}

/**
 * The set of commands `pikku` actually exposes, read from the wireCLI call that
 * defines them. Parsed from source rather than from `.pikku/*.gen.json`, which
 * is gitignored and so absent on a fresh clone.
 */
function realCommands(): Set<string> {
  const commands = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === 'wireCLI' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const block = propertyNamed(node.arguments[0], 'commands')
      if (block && ts.isObjectLiteralExpression(block.initializer)) {
        for (const p of block.initializer.properties) {
          if (ts.isPropertyAssignment(p)) {
            commands.add(p.name.getText().replace(/['"]/g, ''))
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(wiringPath))
  return commands
}

/**
 * Method names on the SecretService interface, plus the ones concrete services
 * add on top of it (init/close/rotateKEK live on implementations, not the
 * interface).
 */
function realSecretMethods(): Set<string> {
  const methods = new Set<string>(['init', 'close', 'rotateKEK'])
  const visit = (node: ts.Node): void => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.getText() === 'SecretService'
    ) {
      for (const member of node.members) {
        if (ts.isMethodSignature(member) && member.name) {
          methods.add(member.name.getText())
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(secretServicePath))
  return methods
}

function skillDocs(): { skill: string; text: string }[] {
  const docs: { skill: string; text: string }[] = []
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, f.name)
        if (f.isDirectory()) walk(path)
        else if (f.name.endsWith('.md'))
          docs.push({ skill: entry.name, text: readFileSync(path, 'utf-8') })
      }
    }
    walk(join(skillsDir, entry.name))
  }
  return docs
}

/**
 * Commands that were removed and that a skill may still NAME, in prose, to warn
 * an agent off them — `pikku tests` was deleted in #865 and pikku-scenario says
 * so. They are still banned from fenced shell blocks, which is where an
 * instruction to actually run something lives.
 */
const REMOVED_BUT_NAMEABLE = new Set(['tests'])

/**
 * Prose says "pikku functions" constantly; an instruction to RUN something is
 * always written as code. Fenced blocks are runnable, inline spans are usually
 * references — hence the split.
 */
const RUNNABLE_LANGS = new Set(['bash', 'sh', 'shell', 'console', ''])

function codeSpans(text: string): { span: string; runnable: boolean }[] {
  const spans: { span: string; runnable: boolean }[] = []
  // Walk fences line by line. A regex cannot do this: it pairs an opening fence
  // with the wrong closing one as soon as the languages differ, which silently
  // stops the whole scan from seeing runnable blocks at all.
  let lang: string | null = null
  for (const line of text.split('\n')) {
    const fence = line.match(/^\s*```(\w*)\s*$/)
    if (fence) {
      lang = lang === null ? fence[1]!.toLowerCase() : null
      continue
    }
    if (lang !== null) {
      spans.push({ span: line, runnable: RUNNABLE_LANGS.has(lang) })
    } else {
      for (const [, body] of line.matchAll(/`([^`\n]+)`/g)) {
        spans.push({ span: body!, runnable: false })
      }
    }
  }
  return spans
}

describe('skills reference things that exist', () => {
  test('every `pikku <command>` a skill tells you to run is a real command', () => {
    const commands = realCommands()
    assert.ok(
      commands.size > 20 && commands.has('all'),
      `command extraction looks broken — found ${commands.size}`
    )

    const bad: string[] = []
    for (const { skill, text } of skillDocs()) {
      for (const { span, runnable } of codeSpans(text)) {
        // A command invocation: `pikku <word>` at the start of a span/line.
        const m = span.trim().match(/^(?:npx\s+|yarn\s+)?pikku\s+([a-z][\w-]*)/)
        if (!m) continue
        const command = m[1]!
        if (commands.has(command)) continue
        if (!runnable && REMOVED_BUT_NAMEABLE.has(command)) continue
        bad.push(
          `${skill}: \`pikku ${command}\` is not a pikku command` +
            (runnable ? ' (in a runnable block)' : '')
        )
      }
    }
    assert.deepEqual(
      bad,
      [],
      `skills tell agents to run commands that do not exist:\n  ${bad.join('\n  ')}\n` +
        `real commands: ${[...commands].sort().join(', ')}`
    )
  })

  test('every secrets.<method>() a skill documents exists on SecretService', () => {
    const methods = realSecretMethods()
    assert.ok(
      methods.has('getSecret') && methods.has('setSecret'),
      `secret-method extraction looks broken — found ${[...methods].join(', ')}`
    )

    const bad: string[] = []
    for (const { skill, text } of skillDocs()) {
      for (const [, method] of text.matchAll(
        /\bsecrets\.([a-zA-Z]\w*)\s*[(<]/g
      )) {
        if (!methods.has(method!)) {
          bad.push(`${skill}: secrets.${method}() does not exist`)
        }
      }
    }
    assert.deepEqual(
      bad,
      [],
      `skills document secret methods that do not exist:\n  ${bad.join('\n  ')}\n` +
        `real methods: ${[...methods].sort().join(', ')}`
    )
  })
})
