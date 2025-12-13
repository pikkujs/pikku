import { pikkuSessionlessFunc } from '#pikku'
import { CommandSummary } from '../../../utils/command-summary.js'

export const pikkuSummary: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, getInspectorState }) => {
    const summary = new CommandSummary('all')
    const state = await getInspectorState()

    if (state.http?.meta) {
      const httpRouteCount = (
        Object.values(state.http.meta) as Record<string, unknown>[]
      ).reduce((sum, routes) => sum + Object.keys(routes).length, 0)
      if (httpRouteCount > 0) summary.set('httpRoutes', httpRouteCount)
    }

    if (state.channels?.meta) {
      summary.set('channels', Object.keys(state.channels.meta).length)
    }

    if (state.scheduledTasks?.meta) {
      summary.set(
        'scheduledTasks',
        Object.keys(state.scheduledTasks.meta).length
      )
    }

    if (state.queueWorkers?.meta) {
      summary.set('queueWorkers', Object.keys(state.queueWorkers.meta).length)
    }

    if (state.mcpEndpoints) {
      const mcpTotal =
        Object.keys(state.mcpEndpoints.toolsMeta || {}).length +
        Object.keys(state.mcpEndpoints.resourcesMeta || {}).length +
        Object.keys(state.mcpEndpoints.promptsMeta || {}).length
      if (mcpTotal > 0) summary.set('mcpEndpoints', mcpTotal)
    }

    if (state.cli?.meta) {
      const totalCommands: number = Object.values(state.cli.meta).reduce(
        (sum: number, program: any) => sum + (program.commands?.length || 0),
        0
      )
      if (totalCommands > 0) summary.set('cliCommands', totalCommands)
    }

    if (state.workflows?.meta) {
      summary.set('workflows', Object.keys(state.workflows.meta).length)
    }

    if (state.forgeNodes?.meta) {
      const forgeNodesCount = Object.keys(state.forgeNodes.meta).length
      if (forgeNodesCount > 0) summary.set('forgeNodes', forgeNodesCount)
    }

    if (state.workflows?.graphMeta) {
      const workflowGraphsCount = Object.keys(state.workflows.graphMeta).length
      if (workflowGraphsCount > 0)
        summary.set('workflowGraphs', workflowGraphsCount)
    }

    if (!logger.isSilent()) {
      console.log(summary.format())
    }
  },
})
