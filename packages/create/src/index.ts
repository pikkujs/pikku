#!/usr/bin/env node

import chalk from 'chalk'
import inquirer from 'inquirer'
import path from 'path'
import { downloadTemplate } from 'giget'
import { createSpinner } from 'nanospinner'
import {
  cleanTSConfig,
  lazymkdir,
  mergeDirectories,
  mergeJsonFiles,
  replaceFunctionReferences,
} from './utils.js'
import { program } from 'commander'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'

const BASE_URL = 'gh:pikkujs/pikku/templates'

const templates = [
  'cloudflare-websocket',
  'cloudflare-workers',
  // 'express',
  'express-middleware',
  'fastify',
  'fastify-plugin',
  // 'functions',
  'nextjs',
  'serverless',
  'serverless-websocket',
  'uws',
  'ws',
] as const

const packageManagers = ['npm', 'yarn', 'pnpm'] as const

type Template = (typeof templates)[number]
type PackageManager = (typeof packageManagers)[number]

interface Answers {
  name: string
  template: Template
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

async function run() {
  console.log(chalk.green('Welcome to the Pikku Project Generator!'))

  const answers: Answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: cliOptions.name || 'my-app',
      when: !cliOptions.name,
    },
    {
      type: 'list',
      name: 'template',
      message: 'Which template do you want to use?',
      choices: templates,
      when: !cliOptions.template,
    },
    {
      type: 'input',
      name: 'version',
      message: 'Version:',
      default: cliOptions.version,
      when: !cliOptions.version,
    },
    {
      type: 'confirm',
      name: 'install',
      message: 'Install dependencies?',
      default: cliOptions.install,
      when: cliOptions.install === undefined,
    },
    {
      type: 'list',
      name: 'packageManager',
      message: 'Choose a package manager:',
      choices: ['npm', 'yarn', 'pnpm', 'bun'],
      default: cliOptions.packageManager,
      when: !cliOptions.packageManager,
    },
  ])

  const { name, template, version, install, packageManager } = {
    ...cliOptions,
    ...answers,
  }

  const targetPath = path.join(process.cwd(), name)
  const versionRef = version ? `#${version}` : ''

  const functionsUrl = `${BASE_URL}/functions${versionRef}`
  const templateUrl = `${BASE_URL}/${template}${versionRef}`

  const spinner = createSpinner('Downloading templates...').start()

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
    mergeJsonFiles(
      [functionsPath, templatePath],
      { name },
      targetPath,
      'package.json'
    )
    mergeJsonFiles(
      [functionsPath, templatePath],
      {},
      targetPath,
      'pikku.config.json'
    )
    mergeDirectories(functionsPath, targetPath)
    mergeDirectories(templatePath, targetPath)
    replaceFunctionReferences(targetPath)
    cleanTSConfig(targetPath)

    const packageContent = JSON.parse(
      readFileSync(`${targetPath}/package.json`, 'utf-8')
    )
    packageContent.scripts.postinstall = 'npx --yes @pikku/cli'
    writeFileSync(
      `${targetPath}/package.json`,
      JSON.stringify(packageContent, null, 2)
    )
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

    // console.log(chalk.blue('🦎 Running pikku...'))
    // spawnSync(packageManager, ['run', 'pikku'], {
    //   cwd: targetPath,
    //   stdio: 'inherit',
    // })
  }

  console.log(chalk.green('\n✅ Project setup complete!'))
  console.log(`Run the following command to get started:\n`)
  console.log(chalk.bold(`cd ${name}`))
}

run()
