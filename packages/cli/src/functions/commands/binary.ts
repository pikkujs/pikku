import { resolve, dirname } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

import { pikkuSessionlessFunc } from '#pikku'

function targetSuffix(target: string): string {
  return target.replace(/^bun-/, '').replace(/[^a-z0-9_-]/g, '-')
}

export const binary = pikkuSessionlessFunc<{ compileTarget?: string }, void>({
  func: async ({ logger, config }, data) => {
    const binConfig = config.binary
    if (!binConfig) {
      throw new Error(
        'No "binary" config found in pikku.config.json. Add a "binary" section with "entrypoint" and "output".'
      )
    }

    const entrypoint = resolve(config.rootDir, binConfig.entrypoint)
    if (!existsSync(entrypoint)) {
      throw new Error(`Binary entrypoint not found: ${entrypoint}`)
    }

    const outputBase = resolve(config.rootDir, binConfig.output)
    const outputDir = dirname(outputBase)
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    const targets = data?.compileTarget
      ? [data.compileTarget]
      : binConfig.targets?.length
        ? binConfig.targets
        : [undefined]

    for (const target of targets) {
      const outputPath = target
        ? `${outputBase}-${targetSuffix(target)}`
        : outputBase
      const args = ['build', '--compile', `--outfile=${outputPath}`, entrypoint]
      if (target) args.splice(2, 0, `--target=${target}`)

      logger.info(`Compiling${target ? ` for ${target}` : ''}...`)
      execFileSync('bun', args, { stdio: 'inherit' })
      logger.info(`Output: ${outputPath}`)
    }
  },
})
