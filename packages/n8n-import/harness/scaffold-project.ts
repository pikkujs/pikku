/**
 * Scaffold a real, minimal Pikku project on disk for the boot harness: writes
 * pikku.config.json / tsconfig.json / package.json (with the `#pikku/*` imports
 * map) plus the generated workflow files, so the real `pikku all` codegen can
 * run against it. Returns the project directory.
 */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface ScaffoldOptions {
  projectDir: string
  /** path -> content, as returned by generateWorkflowFromN8n */
  files: Record<string, string>
}

const PIKKU_CONFIG = {
  srcDirectories: ['./src'],
  outDir: './.pikku',
  tsconfig: './tsconfig.json',
}

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    paths: {
      '#pikku/*': ['./.pikku/*'],
    },
  },
  include: ['src/**/*.ts', '.pikku/**/*.ts'],
}

const PACKAGE_JSON = {
  name: 'n8n-boot-probe',
  private: true,
  type: 'module',
  imports: {
    '#pikku/*': './.pikku/*',
  },
  dependencies: {
    '@pikku/core': '*',
  },
}

export function scaffoldProject({
  projectDir,
  files,
}: ScaffoldOptions): string {
  mkdirSync(join(projectDir, 'src'), { recursive: true })
  writeFileSync(
    join(projectDir, 'pikku.config.json'),
    JSON.stringify(PIKKU_CONFIG, null, 2)
  )
  writeFileSync(
    join(projectDir, 'tsconfig.json'),
    JSON.stringify(TSCONFIG, null, 2)
  )
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify(PACKAGE_JSON, null, 2)
  )
  for (const [rel, content] of Object.entries(files)) {
    const target = join(projectDir, 'src', rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return projectDir
}

export function linkNodeModules(projectDir: string, from: string) {
  // Symlink a node_modules so `@pikku/core` and friends resolve.
  cpSync(from, join(projectDir, 'node_modules'), {
    recursive: true,
    verbatimSymlinks: true,
  })
}
