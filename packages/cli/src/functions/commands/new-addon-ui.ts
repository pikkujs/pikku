import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { mkdir, writeFile } from 'fs/promises'

const pascal = (name: string) =>
  name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase())

const camel = (name: string) => {
  const p = pascal(name)
  return p[0].toLowerCase() + p.slice(1)
}

export const addonUiFiles = (name: string): Record<string, string> => {
  const title = pascal(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  const fn = camel(name)
  return {
    'package.json': JSON.stringify(
      {
        name: `@pikku/addon-${name}`,
        version: '0.0.1',
        type: 'module',
        imports: {
          '#pikku/*.js': './dist/.pikku/*.js',
          '#pikku/*': ['./dist/.pikku/*/index.js', './dist/.pikku/*'],
        },
        exports: {
          '.': {
            types: './dist/src/index.d.ts',
            import: './dist/src/index.js',
          },
          './.pikku/*': './dist/.pikku/addon/*',
          './screens/*': './dist/src/screens/*.js',
        },
        files: ['dist'],
        scripts: {
          prebuild: 'pikku all',
          build: 'tsc && pikku dist',
          pikku: 'pikku all',
        },
        peerDependencies: { '@pikku/core': '*', react: '*', zod: '^4' },
        devDependencies: {
          '@pikku/cli': '*',
          '@pikku/core': '*',
          '@pikku/inspector': '*',
          '@types/react': '*',
          typescript: '^5.7.2',
          zod: '^4',
        },
      },
      null,
      2
    ),
    'pikku.config.json': JSON.stringify(
      {
        $schema:
          'https://raw.githubusercontent.com/pikkujs/pikku/refs/heads/main/packages/cli/cli.schema.json',
        tsconfig: './tsconfig.json',
        srcDirectories: ['src', 'types'],
        outDir: './.pikku',
        addon: { displayName: title, description: `${title} for Pikku Studio` },
      },
      null,
      2
    ),
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2021',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          jsx: 'react-jsx',
          rootDir: '.',
          outDir: './dist',
          declaration: true,
          sourceMap: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          paths: {
            '#pikku/*.js': ['./.pikku/*.ts'],
            '#pikku/*': ['./.pikku/*/index.ts', './.pikku/*'],
          },
        },
        include: ['src/**/*', 'types/**/*', '.pikku/**/*.ts'],
        exclude: ['node_modules', 'dist', '.pikku/**/*.d.ts'],
      },
      null,
      2
    ),
    'src/screens.ts': `import { defineScreens } from '@pikku/core/addon'

export default defineScreens({
  title: '${title}',
  screens: [
    {
      path: '/',
      title: '${title}',
      nav: true,
      scopes: ['${name}:read'],
      component: () => import('./screens/Home.js'),
    },
  ],
})
`,
    'src/functions/hello.function.ts': `import { pikkuSessionlessFunc } from '#pikku/addon/function'

export const ${fn}Hello = pikkuSessionlessFunc<void, { message: string }>({
  scopes: ['${name}:read'],
  func: async () => ({ message: 'Hello from ${title}' }),
})
`,
    'src/screens/Home.tsx': `export default function Home() {
  return <h1>${title}</h1>
}
`,
    'types/application-types.d.ts': `import type { CoreConfig, CoreServices, CoreSingletonServices, CoreUserSession } from '@pikku/core/types'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {}

export interface Services extends CoreServices<SingletonServices> {}
`,
    'src/services.ts': `import { pikkuAddonServices } from '#pikku/addon/setup'

export const createSingletonServices = pikkuAddonServices(async () => ({}))
`,
    'src/scopes.ts': `import { defineScope } from '@pikku/core/scope'

defineScope({
  '${name}': {
    displayName: '${title}',
    description: '${title} for Pikku Studio',
    scopes: {
      read: { description: 'See ${title}' },
    },
  },
})
`,
    'src/index.ts': `export * from './functions/hello.function.js'
import './scopes.js'
`,
  }
}

export const scaffoldAddonUi = async (
  logger: { info: (message: string) => void; error: (message: string) => void },
  { name, dir }: { name: string; dir?: string }
): Promise<void> => {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`Addon name must be lowercase kebab-case: ${name}`)
  }
  const root = resolve(dir ?? join('packages', `addon-${name}`))
  if (existsSync(root)) {
    throw new Error(`Directory already exists: ${root}`)
  }
  for (const [file, content] of Object.entries(addonUiFiles(name))) {
    const path = join(root, file)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content, 'utf-8')
  }
  logger.info(`Created addon at ${root}`)
  logger.info(
    `Install it with wireAddon({ name: '${name}', package: '@pikku/addon-${name}', ui: true })`
  )
}
