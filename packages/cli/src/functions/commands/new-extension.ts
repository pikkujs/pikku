import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { pikkuSessionlessFunc } from '#pikku/function'

const pascal = (name: string) =>
  name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase())

const camel = (name: string) => {
  const p = pascal(name)
  return p[0].toLowerCase() + p.slice(1)
}

export const extensionFiles = (name: string): Record<string, string> => {
  const title = pascal(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  const fn = camel(name)
  return {
    'package.json': JSON.stringify(
      {
        name: `@pikku/extension-${name}`,
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
          './.pikku/extension/*': './dist/.pikku/extension/*',
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
    'src/extension.ts': `import { defineExtension } from '@pikku/core/addon'

export default defineExtension({
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
    'src/functions/hello.function.ts': `import { pikkuSessionlessFunc } from '#pikku/function'

export const ${fn}Hello = pikkuSessionlessFunc<void, { message: string }>({
  scopes: ['${name}:read'],
  func: async () => ({ message: 'Hello from ${title}' }),
})
`,
    'src/screens/Home.tsx': `export default function Home() {
  return <h1>${title}</h1>
}
`,
    'src/index.ts': `export * from './functions/hello.function.js'
`,
  }
}

export const pikkuNewExtension = pikkuSessionlessFunc<
  { name: string; dir?: string },
  void
>({
  func: async ({ logger }, { name, dir }) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      logger.error(`Extension name must be lowercase kebab-case: ${name}`)
      process.exit(1)
    }
    const root = resolve(dir ?? join('packages', `extension-${name}`))
    if (existsSync(root)) {
      logger.error(`Directory already exists: ${root}`)
      process.exit(1)
    }
    for (const [file, content] of Object.entries(extensionFiles(name))) {
      const path = join(root, file)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content, 'utf-8')
    }
    logger.info(`Created extension at ${root}`)
    logger.info(
      `Install it in Studio with wireExtension({ name: '${name}', package: '@pikku/extension-${name}' })`
    )
  },
})
