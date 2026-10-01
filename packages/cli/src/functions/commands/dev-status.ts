import { join } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { readDevAddress } from './dev-address.js'

/** Reports whether `pikku dev` is running for this project, where, and whether its last codegen pass failed. */
export const devStatus = pikkuSessionlessFunc<{}, void>({
  func: async ({ config }) => {
    const address = readDevAddress(
      config.runtimeDir ?? join(config.rootDir, '.pikku-runtime')
    )
    if (!address) {
      process.stdout.write('pikku dev is not running.\n')
      process.exitCode = 1
      return
    }
    const lines = [
      `pikku dev is running at ${address.apiUrl} (pid ${address.pid}, since ${address.startedAt})`,
    ]
    const codegen = address.codegen
    if (codegen && !codegen.ok) {
      lines.push(
        `Last codegen failed at ${codegen.at}; the server is running the code from before it:\n${codegen.error}`
      )
      process.exitCode = 1
    } else if (codegen) {
      lines.push(`Last codegen succeeded at ${codegen.at}.`)
    }
    process.stdout.write(`${lines.join('\n')}\n`)
  },
})
