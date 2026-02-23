export const serializeConsoleFunctions = (pathToPikkuTypes: string) => {
  return `import { pikkuSessionlessFunc } from '${pathToPikkuTypes}'
import { streamAIAgent, resumeAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamChannel } from '@pikku/core/ai-agent'

export const streamAgentRun = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId?: string },
  any
>({
  title: 'Stream Agent Run',
  description: 'SSE stream of agent conversation responses.',
  expose: false,
  auth: false,
  func: async (services, data, { channel }) => {
    if (!channel) return
    await streamAIAgent(
      data.agentName,
      {
        message: data.message,
        threadId: data.threadId,
        resourceId: data.resourceId || 'console-playground',
      },
      channel as unknown as AIStreamChannel,
      { singletonServices: services }
    )
  },
})

export const resumeAgentRun = pikkuSessionlessFunc<
  {
    agentName: string
    toolCallId: string
    approved: boolean
  },
  any
>({
  title: 'Resume Agent Run',
  description: 'Resume an agent run after tool approval/denial.',
  expose: false,
  auth: false,
  func: async (services, data, { channel }) => {
    if (!channel) return
    await resumeAIAgent(
      {
        toolCallId: data.toolCallId,
        approved: data.approved,
      },
      channel as unknown as AIStreamChannel,
      { singletonServices: services }
    )
  },
})

export interface SetSecretInput {
  secretId: string
  value: unknown
}

export interface SetSecretOutput {
  success: boolean
}

export const setSecret = pikkuSessionlessFunc<SetSecretInput, SetSecretOutput>({
  description: 'Set the value of a secret',
  expose: true,
  auth: false,
  func: async ({ secrets }, { secretId, value }) => {
    await secrets.setSecretJSON(secretId, value)
    return { success: true }
  },
})

export interface GetVariableInput {
  variableId: string
}

export interface GetVariableOutput {
  exists: boolean
  value: unknown | null
}

export const getVariable = pikkuSessionlessFunc<
  GetVariableInput,
  GetVariableOutput
>({
  description: 'Get the current value of a variable',
  expose: true,
  auth: false,
  func: async ({ variables }, { variableId }) => {
    const exists = await variables.has(variableId)
    if (!exists) {
      return { exists: false, value: null }
    }
    try {
      const value = await variables.getJSON(variableId)
      return { exists: true, value }
    } catch {
      const value = await variables.get(variableId)
      return { exists: true, value }
    }
  },
})

export interface SetVariableInput {
  variableId: string
  value: unknown
}

export interface SetVariableOutput {
  success: boolean
}

export const setVariable = pikkuSessionlessFunc<
  SetVariableInput,
  SetVariableOutput
>({
  description: 'Set the value of a variable',
  expose: true,
  auth: false,
  func: async ({ variables }, { variableId, value }) => {
    if (typeof value === 'string') {
      await variables.set(variableId, value)
    } else {
      await variables.setJSON(variableId, value)
    }
    return { success: true }
  },
})
`
}
