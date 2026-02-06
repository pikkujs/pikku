#!/usr/bin/env node

const logo = `
 ______ _ _     _           
(_____ (_) |   | |          
 _____) )| |  _| |  _ _   _ 
|  ____/ | |_/ ) |_/ ) | | |
| |    | |  _ (|  _ (| |_| |
|_|    |_|_| _)_| _)____/ 
`

import chalk from 'chalk'
import { input, select, confirm, Separator } from '@inquirer/prompts'
import path from 'path'
import { downloadTemplate } from 'giget'
import { createSpinner } from 'nanospinner'
import {
  cleanPikkuConfig,
  cleanTSConfig,
  filterFilesByFeatures,
  lazymkdir,
  mergeDirectories,
  mergeJsonFiles,
  preparePackageJsonForYarnLink,
  replaceFunctionReferences,
  serverlessChanges,
  updatePackageJSONScripts,
  wranglerChanges,
} from './utils.js'
import { program } from 'commander'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { unlinkSync, writeFileSync } from 'fs'

const BASE_URL = 'gh:pikkujs/pikku/templates'

const packageManagers = ['npm', 'yarn', 'pnpm'] as const

const templates = [
  {
    template: 'aws-lambda',
    description: 'An aws-lambda template for HTTP and Scheduled tasks',
    supports: ['http', 'scheduled'],
  },
  {
    template: 'aws-lambda-websocket',
    description: 'A Serverless WebSocket template',
    supports: ['channel'],
  },
  {
    template: 'cloudflare-websocket',
    description: 'A Cloudflare Workers WebSocket template',
    supports: ['channel', 'http'],
  },
  {
    template: 'bullmq',
    description: 'A BullMQ Redis-based queue template',
    supports: ['queue'],
  },
  {
    template: 'cloudflare-websocket',
    description: 'A Cloudflare Websocket template',
    supports: ['channel'],
  },
  {
    template: 'cloudflare-workers',
    description: 'A Cloudflare Workers template',
    supports: ['http', 'scheduled'],
  },
  {
    template: 'express',
    description: 'An Express template',
    supports: ['http', 'scheduled', 'sse'],
  },
  {
    template: 'express-middleware',
    description: 'An Express Middleware template',
    supports: ['http', 'scheduled', 'sse'],
  },
  {
    template: 'fastify',
    description: 'A Fastify template',
    supports: ['http', 'sse'],
  },
  {
    template: 'fastify-plugin',
    description: 'A Fastify Plugin template',
    supports: ['http', 'sse'],
  },
  {
    template: 'mcp-server',
    description: 'A Model Context Protocol server template',
    supports: ['mcp'],
  },
  {
    template: 'nextjs',
    description: 'A Nextjs helloworld template',
    supports: ['http', 'fullstack'],
  },
  {
    template: 'nextjs-full',
    description: 'A Nextjs simple book application',
    supports: ['http', 'fullstack'],
  },
  {
    template: 'pg-boss',
    description: 'A PostgreSQL-based queue template using pg-boss',
    supports: ['queue'],
  },
  {
    template: 'uws',
    description: 'A uWebSockets.js template',
    supports: ['http', 'channel', 'scheduled'],
  },
  {
    template: 'ws',
    description: 'A ws template',
    supports: ['http', 'channel', 'scheduled'],
  },
  {
    template: 'yarn-workspace',
    description: 'The official yarn workspace',
    supports: ['http', 'channel', 'scheduled', 'fullstack'],
  },
  {
    template: 'cli',
    description: 'A CLI application template',
    supports: ['cli'],
  },
  {
    template: 'remote-rpc',
    description:
      'A two-server remote RPC template with deployment discovery (PostgreSQL or Redis)',
    supports: ['http'],
  },
  {
    template: 'workflows-pg-boss',
    description: 'A PostgreSQL pg-boss based workflow template',
    supports: ['http', 'workflows'],
  },
  {
    template: 'workflows-bullmq',
    description: 'A BullMQ Redis-based workflow template',
    supports: ['http', 'workflows'],
  },
] as const

type PackageManager = (typeof packageManagers)[number]

interface CliOptions {
  name: string
  template: string
  version: string
  install: boolean
  packageManager: PackageManager
  yarnLink?: string
  stackblitz?: boolean
}

// 🏗 Add CLI Flags with Commander.js
program
  .option('-t, --template <template>', 'Template to use')
  .option('-v, --version <version>', 'Version')
  .option('-n, --name <name>', 'Project name')
  .option('-i, --install', 'Install dependencies')
  .option('-p, --package-manager <packageManager>', 'Package manager')
  .option('--yarn-link <link>', 'Yarn link (for local pikku development)')
  .option('--stackblitz', 'Add StackBlitz configuration')
  .parse(process.argv)

const cliOptions = program.opts()

async function installDependencies(
  targetPath: string,
  { packageManager, install, yarnLink, template }: CliOptions
) {
  if (install) {
    if (yarnLink) {
      writeFileSync(
        path.join(targetPath, '.yarnrc.yml'),
        [
          'compressionLevel: mixed',
          'enableGlobalCache: false',
          'nodeLinker: node-modules',
        ].join('\n')
      )
      // Remove version constraints from @pikku/* packages to prevent yarn
      // from trying to fetch unreleased versions from npm
      preparePackageJsonForYarnLink(targetPath)
    }

    console.log(chalk.blue('📦 Installing dependencies...'))
    const installArgs = ['install']
    if (packageManager === 'yarn') {
      installArgs.push('--no-immutable')
    }
    spawnSync(packageManager, installArgs, {
      cwd: targetPath,
      stdio: 'inherit',
    })

    if (yarnLink) {
      if (packageManager === 'yarn') {
        console.log(chalk.blue('🔗 Linking to Pikku'))
        // Resolve to absolute path from current working directory
        const absoluteYarnLinkPath = path.resolve(yarnLink)
        spawnSync(
          'yarn',
          ['link', '--all', '--private', absoluteYarnLinkPath],
          {
            cwd: targetPath,
            stdio: 'inherit',
          }
        )
      } else {
        console.log(
          chalk.red('⚠️ Yarn link is only supported with yarn package manager')
        )
        process.exit(1)
      }
    }

    console.log(chalk.blue('🦎 Running pikku...'))
    spawnSync(packageManager, ['pikku', '--silent'], {
      cwd: targetPath,
      stdio: 'inherit',
    })

    if (template === 'cli') {
      console.log(
        chalk.blue('🚀 Running pikku again to setup up the remote channel.')
      )
      spawnSync(packageManager, ['pikku', '--silent'], {
        cwd: targetPath,
        stdio: 'inherit',
      })
    }
  }
}

async function setupTemplate(cliOptions: CliOptions) {
  const { version, name: projectPath, packageManager, template } = cliOptions
  const targetPath = path.join(process.cwd(), projectPath)
  const name = projectPath.split('/').pop()!
  const versionRef = version ? `#${version}` : ''

  const functionsUrl = `${BASE_URL}/functions${versionRef}`
  const templateUrl = `${BASE_URL}/${template}${versionRef}`

  const spinner = createSpinner('Downloading template...').start()

  try {
    // Download both templates, with optional version (branch/tag)
    const tmpDirPrefix = tmpdir()
    const functionsPath = `${tmpDirPrefix}/pikku/functions`
    const templatePath = `${tmpDirPrefix}/pikku/template`

    await downloadTemplate(functionsUrl, { dir: functionsPath, force: true })
    await downloadTemplate(templateUrl, { dir: templatePath, force: true })

    spinner.success()

    // Get supported features for the selected template
    const selectedTemplate = templates.find((t) => t.template === template)
    const supportedFeatures = (selectedTemplate?.supports || []) as string[]

    // Filter files based on supported features
    filterFilesByFeatures(functionsPath, supportedFeatures)

    // Merge and process files
    lazymkdir(targetPath)
    mergeJsonFiles([functionsPath, templatePath], targetPath, 'package.json')
    mergeJsonFiles(
      [functionsPath, templatePath],
      targetPath,
      'pikku.config.json'
    )
    mergeJsonFiles([functionsPath, templatePath], targetPath, 'tsconfig.json')
    mergeDirectories(functionsPath, targetPath)
    mergeDirectories(templatePath, targetPath)
    replaceFunctionReferences(targetPath, cliOptions.stackblitz)
    cleanTSConfig(targetPath, cliOptions.stackblitz)
    cleanPikkuConfig(targetPath, supportedFeatures)
    wranglerChanges(targetPath, name)
    serverlessChanges(targetPath, name)
    updatePackageJSONScripts(
      targetPath,
      name,
      packageManager,
      supportedFeatures,
      cliOptions.stackblitz
    )

    if (cliOptions.stackblitz) {
      try {
        unlinkSync(path.join(targetPath, 'run-tests.sh'))
      } catch {
        // File doesn't exist, ignore
      }
    }

    if (packageManager === 'yarn') {
      writeFileSync(path.join(targetPath, 'yarn.lock'), '')
    }
  } catch (e) {
    spinner.error()
    console.log(
      chalk.red(`Failed to download templates: ${(e as Error).message}`)
    )
    process.exit(1)
  }

  await installDependencies(targetPath, cliOptions)

  console.log(chalk.green('\n✅ Project setup complete!'))
  console.log(`Run the following command to get started:\n`)
  console.log(chalk.bold(`cd ${name}`))
}

async function setupRepo(cliOptions: CliOptions, repoName: string) {
  const { version, name } = cliOptions
  const targetPath = path.join(process.cwd(), name)
  const versionRef = version ? `#${version}` : ''

  const spinner = createSpinner('Downloading template...').start()

  try {
    const tmpDirPrefix = tmpdir()
    const repoDirPath = `${tmpDirPrefix}/pikku/${repoName}`
    await downloadTemplate(`gh:pikkujs/${repoName}${versionRef}`, {
      dir: repoDirPath,
      force: true,
    })
    lazymkdir(targetPath)
    mergeDirectories(repoDirPath, targetPath)

    try {
      if (cliOptions.packageManager !== 'npm') {
        unlinkSync(path.join(targetPath, 'package-lock.json'))
      }
    } catch {}
    try {
      if (cliOptions.packageManager !== 'yarn') {
        unlinkSync(path.join(targetPath, 'yarn.lock'))
      }
    } catch {}

    spinner.success()
  } catch (e) {
    spinner.error()
    console.log(
      chalk.red(`Failed to download templates: ${(e as Error).message}`)
    )
    process.exit(1)
  }

  await installDependencies(targetPath, cliOptions)

  console.log(chalk.green('\n✅ Project setup complete!'))
  console.log(`Run the following command to get started:\n`)
  console.log(chalk.bold(`cd ${name}`))
}

async function run() {
  const version = cliOptions.version || 'main'

  console.log(chalk.hex('#a863ee').bold(logo))
  console.log(
    chalk.hex('#a863ee').bold('Welcome to the Pikku Project Generator!\n')
  )

  const name =
    cliOptions.name ||
    (await input({
      message: 'Project name:',
      default: cliOptions.name || 'my-app',
    }))

  const template: (typeof templates)[number]['template'] =
    cliOptions.template ||
    (await select({
      message: 'Which template would you like to to use?',
      choices: templates.map(({ template, description }) => ({
        name: template,
        value: template,
        description,
      })),
    }))

  const packageManager =
    template === 'yarn-workspace'
      ? 'yarn'
      : cliOptions.packageManager ||
        (await select({
          message: 'Which package manager do you want to use?',
          choices: [
            {
              name: 'npm',
              value: 'npm',
              description: 'npm is the most popular package manager',
            },
            {
              name: 'yarn',
              value: 'yarn',
              description: 'yarn is what pikku usually uses',
            },
            {
              name: 'bun',
              value: 'bun',
              description: 'bun support is still experimental',
            },
            new Separator(),
            {
              name: 'pnpm',
              value: 'pnpm',
              disabled: '(pnpm is not available)',
            },
          ],
        }))

  const install =
    cliOptions.install ||
    (await confirm({
      message: 'Install dependencies?',
    }))

  const selectedOptions: CliOptions = {
    name,
    template,
    version,
    install,
    packageManager,
    yarnLink: cliOptions.yarnLink,
    stackblitz: cliOptions.stackblitz,
  }

  if (template === 'yarn-workspace') {
    await setupRepo(selectedOptions, 'yarn-workspace-starter')
  } else if (template === 'nextjs-full') {
    await setupRepo(selectedOptions, 'nextjs-app-starter')
  } else {
    await setupTemplate(selectedOptions)
  }
}

run()
