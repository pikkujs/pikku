import { FabricPreconditionError } from './errors.js'
export interface JudgedChange {
  title: string
  body: string | null
}

export interface PlanQuestion {
  title: string
  changes: JudgedChange[]
  reads: string[]
}

export interface PlanVerdict {
  needsPlan: boolean
  why: string
}

/** Anything that can answer one yes/no question about a changeset. */
export interface PlanJudge {
  judge(question: PlanQuestion): Promise<PlanVerdict>
}

export const LARGE_CHANGESET = 6

const QUESTION =
  'Does this changeset need a technical plan before it is built? Answer yes if it adds or changes who may do something (roles, permissions, scopes), adds a new kind of record, changes what is stored, or spans several screens or functions. Answer no for copy, styling, layout, or a fix inside one existing function or screen.'

/**
 * A judge behind any HTTP endpoint that takes `{question, context}` and answers
 * `{verdict, reason}` — TypeSafe, Laya, or one of your own.
 */
export const httpPlanJudge = (url: string, token?: string): PlanJudge => ({
  async judge({ title, changes, reads }) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        question: QUESTION,
        context: [
          `Changeset: ${title}`,
          ...(reads.length ? [`Reads tables: ${reads.join(', ')}`] : []),
          ...changes.map((c) => `- ${c.title}${c.body ? `\n  ${c.body}` : ''}`),
        ].join('\n'),
      }),
    })
    if (!response.ok) throw new FabricPreconditionError(`judge answered ${response.status}`)
    const { verdict, reason } = (await response.json()) as {
      verdict: unknown
      reason?: string
    }
    if (typeof verdict !== 'boolean' && verdict !== 'yes' && verdict !== 'no')
      throw new FabricPreconditionError(`judge gave no verdict: ${JSON.stringify(verdict)}`)
    return {
      needsPlan: verdict === true || verdict === 'yes',
      why: `judge: ${reason ?? (verdict === true || verdict === 'yes' ? 'yes' : 'no')}`,
    }
  },
})

export const configuredPlanJudge = (
  env: NodeJS.ProcessEnv = process.env
): PlanJudge | null =>
  env.PIKKU_PLAN_JUDGE_URL
    ? httpPlanJudge(env.PIKKU_PLAN_JUDGE_URL, env.PIKKU_PLAN_JUDGE_TOKEN)
    : null

/**
 * Fixed rules first: a table created or altered, or a large changeset, is
 * planned. What is left goes to the judge, and a judge that fails is read as
 * yes — an unneeded plan costs a turn, a missing one costs the schema.
 */
export async function needsPlan(
  question: PlanQuestion & { creates: string[]; alters: string[] },
  judge: PlanJudge | null
): Promise<PlanVerdict> {
  if (question.creates.length || question.alters.length)
    return { needsPlan: true, why: 'it creates or alters a table' }
  if (question.changes.length >= LARGE_CHANGESET)
    return {
      needsPlan: true,
      why: `it has ${question.changes.length} changes`,
    }
  if (!judge)
    return {
      needsPlan: false,
      why: 'no table created or altered, and no judge is configured',
    }
  try {
    return await judge.judge(question)
  } catch (error) {
    return {
      needsPlan: true,
      why: `the judge failed (${error instanceof Error ? error.message : String(error)}), so it is planned`,
    }
  }
}
