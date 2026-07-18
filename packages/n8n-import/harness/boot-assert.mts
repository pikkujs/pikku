/**
 * Boots a generated Pikku project IN-PROCESS and reports what registered and
 * whether it is invocable. Run with cwd = the project dir:
 *
 *   node --import tsx harness/boot-assert.mts   (cwd = project)
 *
 * Prints one line of JSON to stdout prefixed with `BOOT_RESULT:` so the driver
 * can parse it regardless of framework log noise. A generated stub throwing
 * `— implement me` counts as invocable (the function dispatched — wiring works).
 */
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const dir = process.cwd()
const abs = (p: string) => pathToFileURL(resolve(dir, p)).href

async function main() {
  // Importing the bootstrap runs all registration side-effects.
  await import(abs('.pikku/pikku-bootstrap.gen.ts'))

  const core: any = await import('@pikku/core')
  const internal: any = await import('@pikku/core/internal')
  const ai: any = await import('@pikku/core/ai-agent')
  const rpc: any = await import('@pikku/core/rpc')
  const svc: any = await import(abs('src/services.ts'))

  const keysOf = (v: any): string[] => {
    if (!v) return []
    if (v instanceof Map) return [...v.keys()]
    if (typeof v.keys === 'function') return [...v.keys()]
    return Object.keys(v)
  }

  const functionNames: string[] =
    typeof core.getAllFunctionNames === 'function'
      ? [...core.getAllFunctionNames()]
      : typeof core.getFunctionNames === 'function'
        ? [...core.getFunctionNames()]
        : []
  const agentNames = keysOf(ai.getAIAgents?.())
  const graphNames = keysOf(
    internal.pikkuState?.(null, 'workflows', 'registrations')
  )

  const config = await svc.createConfig()
  const singleton = await svc.createSingletonServices(config, {})
  const ctx = rpc.rpcService.getContextRPCService(singleton, {})

  // Invoke every generated stub function once — a throw proves it dispatched.
  const invoked: Array<{ name: string; threw: boolean; wired: boolean }> = []
  for (const name of functionNames) {
    try {
      await ctx.invoke(name, {})
      invoked.push({ name, threw: false, wired: true })
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      // RPCNotFound = not wired; any other throw = dispatched into the function.
      const notFound = /RPCNotFound|not found/i.test(msg)
      invoked.push({ name, threw: true, wired: !notFound })
    }
  }

  await core.stopSingletonServices?.()

  const result = {
    ok: true,
    functions: functionNames,
    agents: agentNames,
    graphs: graphNames,
    invoked,
    allWired: invoked.every((i) => i.wired),
  }
  console.log('BOOT_RESULT:' + JSON.stringify(result))
}

main().catch((e) => {
  console.log(
    'BOOT_RESULT:' +
      JSON.stringify({ ok: false, error: String(e?.stack ?? e).slice(0, 500) })
  )
  process.exit(1)
})
