import { existsSync } from 'fs'
import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'

export const bootstrap: any = pikkuVoidFunc({
  func: async ({ logger, config, rpc, getInspectorState }) => {
    let typesDeclarationFileExists = true

    if (!existsSync(config.typesDeclarationFile)) {
      typesDeclarationFileExists = false
    }

    await rpc.invoke('pikkuFunctionTypes', null)

    if (!typesDeclarationFileExists) {
      logger.info(`• Type file first created, inspecting again...\x1b[0m`)
      await getInspectorState(true, true)
    }

    // Generate wiring-specific type files for tree-shaking
    await rpc.invoke('pikkuFunctionTypesSplit', null)
    await rpc.invoke('pikkuHTTPTypes', null)
    await rpc.invoke('pikkuChannelTypes', null)
    await rpc.invoke('pikkuSchedulerTypes', null)
    await rpc.invoke('pikkuQueueTypes', null)
    await rpc.invoke('pikkuMCPTypes', null)
    await rpc.invoke('pikkuCLITypes', null)

    // Check for critical errors and exit if any were logged
    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
