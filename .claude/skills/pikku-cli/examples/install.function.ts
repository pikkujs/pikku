import { pikkuFunc } from '#pikku/pikku-types.gen.js'

/**
 * Package installation function
 * Demonstrates CLI function with multiple positionals and options
 */

type InstallInput = {
  package: string // from <package>
  version?: string // from [version]
  force?: boolean // from --force/-f option
  verbose?: boolean // from --verbose/-v global option (inherited)
}

type InstallOutput = {
  installed: string
  version: string
  path: string
}

export const installPackage = pikkuFunc<InstallInput, InstallOutput>({
  docs: {
    summary: 'Install a package',
    description: 'Download and install a package from registry',
    tags: ['cli', 'package'],
    errors: [],
  },
  func: async ({ logger }, data) => {
    const version = data.version || 'latest'

    if (data.verbose) {
      logger.info('install.start', {
        package: data.package,
        version,
        force: data.force,
      })
    }

    // Mock installation logic
    const path = `/node_modules/${data.package}`

    if (data.verbose) {
      logger.info('install.complete', { package: data.package, path })
    }

    return {
      installed: data.package,
      version,
      path,
    }
  },
})
