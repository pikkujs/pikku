/**
 * Scenario steps for the console code editor.
 *
 * These replace the cucumber glue in tests/steps/code-editor.steps.ts. Every
 * effect goes through the step's actor, so the RPC calls and the browser
 * session are the same signed-in identity.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import type { TypedPersonas } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { requireActor, type TestIdSelector } from '@pikku/core/scenario'
import { describeValue } from './support.js'
import type {} from '@pikku/playwright'

type Actor = TypedPersonas[keyof TypedPersonas]

interface FunctionMeta {
  name?: string
  pikkuFuncId?: string
  sourceFile: string
  exportedName: string
}

interface SourceLocation {
  sourceFile: string
  exportedName: string
}

const functionLocation = async (
  actor: Actor,
  functionName: string
): Promise<SourceLocation> => {
  const meta = (await actor.invoke(
    'console:getFunctionsMeta',
    null
  )) as FunctionMeta[]
  const found = meta.find(
    (f) => f.name === functionName || f.pikkuFuncId === functionName
  )
  if (!found) {
    throw new Error(`Function "${functionName}" not found in meta`)
  }
  return { sourceFile: found.sourceFile, exportedName: found.exportedName }
}

const agentLocation = async (
  actor: Actor,
  agentKey: string
): Promise<SourceLocation> => {
  const allMeta = (await actor.invoke('console:getAllMeta', null)) as {
    agentsMeta?: Record<string, SourceLocation>
  }
  const found = allMeta.agentsMeta?.[agentKey]
  if (!found) {
    throw new Error(`Agent "${agentKey}" not found in meta`)
  }
  return { sourceFile: found.sourceFile, exportedName: found.exportedName }
}

export const readsFunctionSource = pikkuScenarioStep<
  { functionName: string },
  { wrapperName: string; config: Record<string, unknown>; body: string }
>({
  name: 'readsFunctionSource',
  description: 'reads a function definition in the console',
  default: async (_services, { functionName }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const location = await functionLocation(actor, functionName)
    return (await actor.invoke('console:readFunctionSource', location)) as {
      wrapperName: string
      config: Record<string, unknown>
      body: string
    }
  },
})

export const readsFunctionBody = pikkuScenarioStep<
  { functionName: string },
  { body: string }
>({
  name: 'readsFunctionBody',
  description: 'reads a function body in the console',
  default: async (_services, { functionName }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const location = await functionLocation(actor, functionName)
    return (await actor.invoke('console:readFunctionBody', location)) as {
      body: string
    }
  },
})

export const updatesFunctionConfig = pikkuScenarioStep<
  { functionName: string; changes: Record<string, unknown> },
  { success: boolean }
>({
  name: 'updatesFunctionConfig',
  description: 'edits a function config in the console',
  default: async (_services, { functionName, changes }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const location = await functionLocation(actor, functionName)
    const result = (await actor.invoke('console:updateFunctionConfig', {
      ...location,
      changes,
    })) as { success: boolean }
    if (!result.success) {
      throw new Error(`Updating ${functionName} config did not succeed`)
    }
    return result
  },
})

export const updatesFunctionBody = pikkuScenarioStep<
  { functionName: string; body: string },
  { success: boolean }
>({
  name: 'updatesFunctionBody',
  description: 'rewrites a function body in the console',
  default: async (_services, { functionName, body }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const location = await functionLocation(actor, functionName)
    const result = (await actor.invoke('console:updateFunctionBody', {
      ...location,
      body,
    })) as { success: boolean }
    if (!result.success) {
      throw new Error(`Updating ${functionName} body did not succeed`)
    }
    return result
  },
})

export const readsAgentSource = pikkuScenarioStep<
  { agentKey: string },
  { config: Record<string, unknown> }
>({
  name: 'readsAgentSource',
  description: 'reads an agent definition in the console',
  default: async (_services, { agentKey }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const location = await agentLocation(actor, agentKey)
    return (await actor.invoke('console:readAgentSource', location)) as {
      config: Record<string, unknown>
    }
  },
})

export const updatesAgentConfig = pikkuScenarioStep<
  { agentKey: string; changes: Record<string, unknown> },
  { success: boolean }
>({
  name: 'updatesAgentConfig',
  description: 'edits an agent config in the console',
  default: async (_services, { agentKey, changes }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const location = await agentLocation(actor, agentKey)
    const result = (await actor.invoke('console:updateAgentConfig', {
      ...location,
      changes,
    })) as { success: boolean }
    if (!result.success) {
      throw new Error(`Updating agent ${agentKey} did not succeed`)
    }
    return result
  },
})

export const expectsValues = pikkuScenarioStep<
  { actual: Record<string, unknown>; expected: Record<string, unknown> },
  { checked: number }
>({
  name: 'expectsValues',
  description: 'sees the expected values',
  default: async (_services, { actual, expected }) => {
    for (const [key, want] of Object.entries(expected)) {
      const got = actual?.[key]
      if (String(got) !== String(want)) {
        throw new Error(
          `Expected ${key} to be ${describeValue(want)}, got ${describeValue(got)}`
        )
      }
    }
    return { checked: Object.keys(expected).length }
  },
})

export const expectsText = pikkuScenarioStep<
  { actual: string; contains: string },
  { found: true }
>({
  name: 'expectsText',
  description: 'sees the expected text',
  default: async (_services, { actual, contains }) => {
    if (!actual?.includes(contains)) {
      throw new Error(`Expected text containing "${contains}", got: ${actual}`)
    }
    return { found: true }
  },
})

/**
 * Opens a console page and waits for it to have rendered something.
 *
 * `waitFor` names the element by test id, the way every other browser step
 * names what it acts on — never as a raw CSS selector, so a page that has no
 * test id for its landing element grows one rather than being addressed by its
 * markup.
 */
export const opensConsolePage = pikkuScenarioStep<
  { path: string; waitFor?: TestIdSelector },
  { url: string }
>({
  name: 'opensConsolePage',
  description: 'opens a console page',
  template: 'opens {path}',
  browser: async (_services, { path, waitFor }, { browser }) => {
    await browser.goto(path)
    if (waitFor) {
      await browser
        .locate(waitFor)
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
    }
    return { url: browser.page.url() }
  },
})

export const clicksRowContaining = pikkuScenarioStep<
  { text: string },
  { clicked: string }
>({
  name: 'clicksRowContaining',
  description: 'clicks a row in the console',
  browser: async (_services, { text }, { browser }) => {
    const row = browser.page.locator('table tbody tr', { hasText: text })
    await row.first().click({ timeout: 15_000 })
    return { clicked: text }
  },
})

export const clicksAgentCard = pikkuScenarioStep<
  { agentKey: string },
  { clicked: string }
>({
  name: 'clicksAgentCard',
  description: 'opens an agent in the console',
  browser: async (_services, { agentKey }, { browser }) => {
    const badge = browser.page
      .locator('[data-agent-id]', { hasText: agentKey })
      .first()
    if (await badge.isVisible().catch(() => false)) {
      await badge.click()
    } else {
      await browser.page
        .getByText(agentKey, { exact: false })
        .first()
        .click({ timeout: 15_000 })
    }
    return { clicked: agentKey }
  },
})

export const seesEditButton = pikkuScenarioStep<
  { title: string },
  { visible: true }
>({
  name: 'seesEditButton',
  description: 'sees the edit button',
  browser: async (_services, { title }, { browser }) => {
    await browser.page
      .locator(`button[title="${title}"]`)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
    return { visible: true }
  },
})
