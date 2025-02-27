#!/usr/bin/env node

const logo = `
 ______ _ _     _           
(_____ (_) |   | |          
 _____) )| |  _| |  _ _   _ 
|  ____/ | |_/ ) |_/ ) | | |
| |    | |  _ (|  _ (| |_| |
|_|    |_|_| \_)_| \_)____/ 
`

import chalk from 'chalk'
import { input, select, confirm, Separator } from '@inquirer/prompts'
import path from 'path'
import { downloadTemplate } from 'giget'
import { createSpinner } from 'nanospinner'
import {
  cleanTSConfig,
  lazymkdir,
  mergeDirectories,
  mergeJsonFiles,
  replaceFunctionReferences,
  serverlessChanges,
  updatePackageJSONScripts,
  wranglerChanges,
} from './utils.js'
import { program } from 'commander'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

const BASE_URL = 'gh:pikkujs/pikku/templates'

const packageManagers = ['npm', 'yarn', 'pnpm'] as const

// type Feature = "http" | "scheduled" | "channel" | "fullstack"
const templates = [
  {
    template: 'cloudflare-websocket',
    description: 'A Cloudflare Workers WebSocket template',
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
    supports: ['http', 'scheduled'],
  },
  {
    template: 'express-middleware',
    description: 'An Express Middleware template',
    supports: ['http', 'scheduled'],
  },
  {
    template: 'fastify',
    description: 'A Fastify template',
    supports: ['http', 'scheduled'],
  },
  {
    template: 'fastify-plugin',
    description: 'A Fastify Plugin template',
    supports: ['http', 'scheduled'],
  },
  {
    template: 'functions',
    description: 'A Functions template',
    supports: [],
  },
  {
    template: 'nextjs',
    description: 'A Nextjs template',
    supports: ['fullstack'],
  },
  {
    template: 'serverless',
    description: 'A Serverless template',
    supports: ['http', 'scheduled'],
  },
  {
    template: 'serverless-websocket',
    description: 'A Serverless WebSocket template',
    supports: ['channel'],
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
    description: 'The yarn worspace',
    supports: ['http', 'channel', 'scheduled', 'fullstack'],
  },
] as const

type PackageManager = (typeof packageManagers)[number]

interface CliOptions {
  name: string
  template: string
  version: string
  install: boolean
  packageManager: PackageManager
}

// 🏗 Add CLI Flags with Commander.js
program
  .option('-t, --template <template>', 'Template to use')
  .option('-v, --version <version>', 'Version')
  .option('-n, --name <name>', 'Project name')
  .option('-i, --install', 'Install dependencies')
  .option('-p, --package-manager <packageManager>', 'Package manager')
  .parse(process.argv)

const cliOptions = program.opts()

async function setupTemplate({
  version,
  name,
  packageManager,
  install,
  template,
}: CliOptions) {
  const targetPath = path.join(process.cwd(), name)
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

    // Merge and process files
    lazymkdir(targetPath)
    mergeJsonFiles([functionsPath, templatePath], targetPath, 'package.json')
    mergeJsonFiles(
      [functionsPath, templatePath],
      targetPath,
      'pikku.config.json'
    )
    mergeDirectories(functionsPath, targetPath)
    mergeDirectories(templatePath, targetPath)
    replaceFunctionReferences(targetPath)
    cleanTSConfig(targetPath)
    wranglerChanges(targetPath, name)
    serverlessChanges(targetPath, name)
    updatePackageJSONScripts(targetPath, name, packageManager)
  } catch (e) {
    spinner.error()
    console.log(
      chalk.red(`Failed to download templates: ${(e as Error).message}`)
    )
    process.exit(1)
  }

  if (install) {
    console.log(chalk.blue('📦 Installing dependencies...'))
    spawnSync(packageManager, ['install'], {
      cwd: targetPath,
      stdio: 'inherit',
    })

    console.log(chalk.blue('🦎 Running pikku...'))
    spawnSync('npx', ['--no-install', '@pikku/cli'], {
      cwd: targetPath,
      stdio: 'inherit',
    })
  }

  console.log(chalk.green('\n✅ Project setup complete!'))
  console.log(`Run the following command to get started:\n`)
  console.log(chalk.bold(`cd ${name}`))
}

async function setupYarnWorkspace({
  version,
  name,
  packageManager,
  install,
}: CliOptions) {
  const targetPath = path.join(process.cwd(), name)
  const versionRef = version ? `#${version}` : ''

  const spinner = createSpinner('Downloading template...').start()

  try {
    const tmpDirPrefix = tmpdir()
    const yarnWorkspacePath = `${tmpDirPrefix}/pikku/yarn-workspace-starter`
    await downloadTemplate(`gh:pikkujs/yarn-workspace-starter${versionRef}`, {
      dir: yarnWorkspacePath,
      force: true,
    })
    mergeDirectories(yarnWorkspacePath, targetPath)
    spinner.success()
  } catch (e) {
    spinner.error()
    console.log(
      chalk.red(`Failed to download templates: ${(e as Error).message}`)
    )
    process.exit(1)
  }

  if (install) {
    console.log(chalk.blue('📦 Installing dependencies...'))
    spawnSync(packageManager, ['install'], {
      cwd: targetPath,
      stdio: 'inherit',
    })

    console.log(chalk.blue('🦎 Running pikku...'))
    spawnSync('npx --yes @pikku/cli', {
      cwd: targetPath,
      stdio: 'inherit',
    })
  }

  console.log(chalk.green('\n✅ Project setup complete!'))
  console.log(`Run the following command to get started:\n`)
  console.log(chalk.bold(`cd ${name}`))
}

async function run() {
  const version = cliOptions.version || 'master'

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

  // const features: Feature[] = await checkbox({
  //   message: 'Select which features you want to include:',
  //   choices: [
  //     { value: 'http', name: 'HTTP' },
  //     { value: 'scheduled', name: 'Scheduled Tasks' },
  //     { value: 'channel', name: 'Channel (WebSockets)' },
  //     { value: 'fullStack', name: 'FullStack (nextJS)' },
  //   ],
  // });

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
  }

  if (template === 'yarn-workspace') {
    await setupYarnWorkspace(selectedOptions)
  } else {
    await setupTemplate(selectedOptions)
  }
}

run()
