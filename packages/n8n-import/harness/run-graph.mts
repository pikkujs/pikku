/**
 * Executes ONE imported workflow graph end-to-end in a booted project.
 * Run with cwd = the scaffolded project dir:
 *   WF="<meta key>" INPUT='{"body":{...}}' node --import tsx <path>/run-graph.mts
 */
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const dir = process.cwd()
const abs = (p: string) => pathToFileURL(resolve(dir, p)).href

async function main() {
  await import(abs('.pikku/pikku-bootstrap.gen.ts'))
  const core: any = await import('@pikku/core')
  const internal: any = await import('@pikku/core/internal')
  const rpc: any = await import('@pikku/core/rpc')
  const svc: any = await import(abs('src/services.ts'))

  const meta = internal.pikkuState(null, 'workflows', 'meta')
  const metaKeys = Object.keys(meta ?? {})
  console.log('WORKFLOW META KEYS:', metaKeys)

  const name = process.env.WF || metaKeys[0]!
  const input = JSON.parse(process.env.INPUT || '{}')
  console.log(`\n▶ running "${name}" with input`, JSON.stringify(input))

  const config = await svc.createConfig()
  const singleton = await svc.createSingletonServices(config, {})
  const ctx = rpc.rpcService.getContextRPCService(singleton, {})

  const { runId } = await ctx.startWorkflow(name, input, { inline: true })
  const ws = singleton.workflowService
  const run = await ws.getRun(runId)
  const steps = await ws.getStepInstances(runId)

  const nodeIds = Object.keys(meta[name]?.nodes ?? {})
  const nodeResults = await ws.getNodeResults(runId, nodeIds)

  console.log('\nRUN STATUS:', run?.status)
  console.log('NODE RESULTS:', JSON.stringify(nodeResults, null, 2))
  console.log(
    'STEPS:',
    JSON.stringify(
      steps?.map((s: any) => ({
        step: s.stepName,
        status: s.status,
        output: s.output ?? s.result,
      })),
      null,
      2
    )
  )

  await core.stopSingletonServices?.()
}

main().catch((e) => {
  console.error('RUN_ERROR:', e?.stack ?? e)
  process.exit(1)
})
