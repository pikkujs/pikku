export function agent<TAgentMap extends Record<string, { output: any }>>(
  agentName: string & keyof TAgentMap
): { func: (services: any, data: any, wire: any) => Promise<any> } {
  return {
    func: async (_services: any, data: any, { rpc }: any) => {
      return rpc.agent.run(agentName, data)
    },
  }
}

export function agentStream<TAgentMap extends Record<string, { output: any }>>(
  agentName: string & keyof TAgentMap
): { func: (services: any, data: any, wire: any) => Promise<void> } {
  return {
    func: async (_services: any, data: any, { rpc }: any) => {
      await rpc.agent.stream(agentName, data)
    },
  }
}

export function agentResume(): {
  func: (
    services: any,
    data: { runId: string; toolCallId: string; approved: boolean },
    wire: any
  ) => Promise<void>
} {
  return {
    func: async (
      _services: any,
      data: { runId: string; toolCallId: string; approved: boolean },
      { rpc }: any
    ) => {
      await rpc.agent.resume(data.runId, {
        toolCallId: data.toolCallId,
        approved: data.approved,
      })
    },
  }
}

export function agentApprove<TAgentMap extends Record<string, { output: any }>>(
  _agentName: string & keyof TAgentMap
): {
  func: (
    services: any,
    data: {
      runId: string
      approvals: { toolCallId: string; approved: boolean }[]
    },
    wire: any
  ) => Promise<any>
} {
  return {
    func: async (
      _services: any,
      data: {
        runId: string
        approvals: { toolCallId: string; approved: boolean }[]
      },
      { rpc }: any
    ) => {
      return rpc.agent.approve(data.runId, data.approvals)
    },
  }
}
