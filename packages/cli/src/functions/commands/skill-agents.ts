import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { parse, stringify } from 'yaml'

/**
 * The frontmatter a skill adds to become a subagent as well as a skill.
 *
 * A skill is instructions a session reads; an agent is a child process a host
 * dispatches and then judges. The difference is entirely the gate, so the gate is
 * the only thing a skill has to declare — everything else about the agent is
 * derived from the skill it already is.
 */
export interface SkillAgentSpec {
  tools?: string
  timeoutMs?: number
  acceptance?: Record<string, unknown>
}

/**
 * The tools that can change the workspace, and so decide the agent's role.
 *
 * `bash` counts because a shell is a superset of the rest: `sed -i`, `echo >` and
 * `git checkout` all mutate without touching a file tool.
 */
const MUTATING_TOOLS = [
  'bash',
  'shell',
  'write',
  'edit',
  'write_files',
  'edit_files',
  'patch',
]

const DEFAULT_TOOLS = 'read, write, edit, bash, grep'

/**
 * The role is derived from the tools rather than declared beside them.
 *
 * It is what acceptance is inferred from, so a skill that declares the two
 * independently can declare them inconsistently — a read-only role holding `write`
 * is an agent the host judges by rules its tools do not match.
 */
function acceptanceRole(tools: string): 'read-only' | 'writer' {
  const declared = tools.split(',').map((tool) => tool.trim())
  return declared.some((tool) => MUTATING_TOOLS.includes(tool))
    ? 'writer'
    : 'read-only'
}

interface SkillFrontmatter {
  name?: string
  description?: string
  agent?: SkillAgentSpec
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

export function parseSkill(
  content: string
): { frontmatter: SkillFrontmatter; body: string } | null {
  const match = content.match(FRONTMATTER)
  if (!match) return null
  try {
    return { frontmatter: parse(match[1]) ?? {}, body: match[2] ?? '' }
  } catch {
    return null
  }
}

/**
 * The first paragraph of the skill's own description, as the one line a host shows
 * when it is choosing between agents.
 *
 * A skill description is written for a trigger matcher and carries TRIGGER/DO NOT
 * TRIGGER clauses that mean nothing to a dispatcher, so they are cut rather than
 * shipped as noise into every agent listing.
 */
function agentDescription(description: string): string {
  return description
    .split(/\bTRIGGER when\b|\bDO NOT TRIGGER\b/)[0]!
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;]\s*$/, '')
}

/**
 * pi reads `acceptance` as a JSON string on one line, and ignores any frontmatter key
 * it does not know — a post-condition under a key pi has no reader for runs nowhere and
 * says nothing about it. Emitting through the one key pi acts on is what makes the gate
 * real rather than decorative.
 */
function renderAgent(
  name: string,
  frontmatter: SkillFrontmatter,
  skillDir: string,
  extensions: string[]
): string {
  const agent = frontmatter.agent!
  const tools = agent.tools ?? DEFAULT_TOOLS
  const lines = [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(agentDescription(frontmatter.description ?? name))}`,
    `tools: ${tools}`,
  ]
  if (extensions.length > 0) {
    lines.push(`extensions: ${extensions.join(', ')}`)
  }
  if (agent.acceptance) {
    lines.push('acceptance:')
    lines.push(
      stringify(agent.acceptance, { indent: 2 })
        .trimEnd()
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')
    )
  }
  lines.push(`acceptanceRole: ${acceptanceRole(tools)}`)
  if (agent.timeoutMs) {
    lines.push(`timeoutMs: ${agent.timeoutMs}`)
  }
  lines.push('---', '')

  const verify = (agent.acceptance?.verify ?? []) as Array<{
    id?: string
    command?: string
  }>

  lines.push(
    `Your instructions are \`${skillDir}/${name}/SKILL.md\`. Read it in full before you act, and follow it as written rather than improvising around it.`,
    '',
    'Your caller dispatched you because this stage of the pipeline has a gate it can check, not because it wanted prose back. So the gate is the job.',
    ''
  )

  if (verify.length > 0) {
    lines.push(
      'You are not done until every one of these exits 0, and you have run them yourself:',
      '',
      ...verify.map((v) => `- \`${v.command}\``),
      '',
      'A refusal is the gate working. Read what it says is wrong, fix that, and run it again — do not stop at the first one, and do not report success on a command you have not seen pass.',
      ''
    )
  }

  lines.push(
    'Report what you ran and what it said, what you changed, and anything in the skill that was wrong, missing or ambiguous. If you could not pass the gate, say so outright and say where you got stuck — a truthful failure is worth more to your caller than a pass it cannot trust.',
    ''
  )

  return lines.join('\n')
}

/**
 * Write out an agent for every installed skill that declares one.
 *
 * Skills without an `agent:` block are not projected: a reference skill has no
 * post-condition a host could check, and an agent whose acceptance is `none` is a
 * subagent dispatched to read something the caller could have read itself.
 */
export async function installSkillAgents(
  skills: string[],
  agentRoot: string,
  skillDir: string,
  update: boolean,
  existing: (path: string) => boolean,
  read: (path: string) => Promise<string | null>,
  /**
   * Host extensions every projected agent loads, as pi resolves them.
   *
   * They are passed in rather than declared by the skill because they belong to
   * whoever is running the agent, not to the instructions it follows: a sandbox
   * fences its writers and routes their model, and the same skill run on a
   * developer's own checkout needs neither.
   */
  extensions: string[] = []
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = []
  const skipped: string[] = []

  for (const name of skills) {
    const content = await read(`${name}/SKILL.md`)
    if (content === null) continue
    const parsed = parseSkill(content)
    if (!parsed?.frontmatter.agent) continue

    const target = join(agentRoot, `${name}.md`)
    if (existing(target) && !update) {
      skipped.push(name)
      continue
    }
    await mkdir(agentRoot, { recursive: true })
    await writeFile(
      target,
      renderAgent(name, parsed.frontmatter, skillDir, extensions),
      'utf-8'
    )
    written.push(name)
  }

  return { written, skipped }
}
