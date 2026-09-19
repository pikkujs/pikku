import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installSkillAgents } from './skill-agents.js'

const skill = (name: string, frontmatter: string) =>
  `---\nname: ${name}\ndescription: >-\n  Does a thing. TRIGGER when: never.\n${frontmatter}---\n\nbody\n`

const GATED = skill(
  'gated',
  `agent:
  tools: read, write, bash
  timeoutMs: 1000
  acceptance:
    level: verified
    verify:
      - id: consistent
        command: pikku knowledge validate
`
)

const READONLY = skill(
  'readonly',
  `agent:
  tools: read, grep
  acceptance:
    level: none
    reason: returns a brief, never a change
`
)

const PLAIN = skill('plain', '')

const reader = (skills: Record<string, string>) => async (path: string) =>
  skills[path.split('/')[0]!] ?? null

const install = async (
  skills: Record<string, string>,
  extensions: string[] = [],
  skillDir = '.pi/skills'
) => {
  const out = mkdtempSync(join(tmpdir(), 'pikku-agents-'))
  const result = await installSkillAgents(
    Object.keys(skills),
    out,
    skillDir,
    true,
    existsSync,
    reader(skills),
    extensions
  )
  return {
    ...result,
    read: (name: string) => readFileSync(join(out, `${name}.md`), 'utf-8'),
  }
}

describe('projecting skills into agents', () => {
  test('only a skill that declares a gate becomes an agent', async () => {
    const { written } = await install({
      gated: GATED,
      plain: PLAIN,
    })
    assert.deepEqual(written, ['gated'])
  })

  test('the role is derived from the tools, never declared beside them', async () => {
    const { read } = await install({ gated: GATED, readonly: READONLY })
    assert.match(read('gated'), /^acceptanceRole: writer$/m)
    assert.match(read('readonly'), /^acceptanceRole: read-only$/m)
  })

  test('bash alone makes a writer, because a shell is every other tool', async () => {
    const { read } = await install({
      sh: skill(
        'sh',
        'agent:\n  tools: read, bash\n  acceptance:\n    level: checked\n'
      ),
    })
    assert.match(read('sh'), /^acceptanceRole: writer$/m)
  })

  test('a verified level is emitted with its verify block visible', async () => {
    const { read } = await install({ gated: GATED })
    const agent = read('gated')
    assert.match(agent, /^acceptance:\n {2}level: verified$/m)
    assert.match(agent, /^ {4}- id: consistent$/m)
    assert.match(agent, /command: pikku knowledge validate/)
  })

  test('the verify commands are repeated in the body as the job', async () => {
    const { read } = await install({ gated: GATED })
    assert.match(read('gated'), /- `pikku knowledge validate`/)
  })

  test('the description drops the trigger clauses a dispatcher cannot use', async () => {
    const { read } = await install({ gated: GATED })
    const description = /^description: (.*)$/m.exec(read('gated'))![1]!
    assert.ok(!description.includes('TRIGGER'))
    assert.match(description, /Does a thing/)
  })

  test('host extensions are written in, so a fenced host can fence what it installs', async () => {
    const { read } = await install({ gated: GATED }, ['/pi/guard.mjs'])
    assert.match(read('gated'), /^extensions: \/pi\/guard\.mjs$/m)
  })

  test('no extensions means no key, rather than an empty one pi would read', async () => {
    const { read } = await install({ gated: GATED })
    assert.ok(!read('gated').includes('extensions:'))
  })

  test('an existing agent is kept unless the caller asked to update', async () => {
    const out = mkdtempSync(join(tmpdir(), 'pikku-agents-'))
    const args = [
      ['gated'],
      out,
      '.pi/skills',
      false,
      existsSync,
      reader({ gated: GATED }),
    ] as const
    const first = await installSkillAgents(...args)
    assert.deepEqual(first.written, ['gated'])
    const second = await installSkillAgents(...args)
    assert.deepEqual(second.written, [])
    assert.deepEqual(second.skipped, ['gated'])
  })

  test('the agent points at the skill directory it was given, not the default', async () => {
    const { read } = await install({ gated: GATED }, [], '.agents/skills')
    assert.ok(read('gated').includes('`.agents/skills/gated/SKILL.md`'))
    assert.ok(!read('gated').includes('.pi/skills'))
  })
})
