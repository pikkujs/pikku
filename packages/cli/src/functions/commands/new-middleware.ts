import { existsSync } from 'fs'
import { dirname } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { pikkuSessionlessFunc } from '#pikku'
import { scaffoldFilePath } from '../../utils/file-writer.js'

export const pikkuNewMiddleware = pikkuSessionlessFunc<
  { name: string; type?: string },
  void
>({
  func: async ({ logger, config }, { name, type = 'simple' }) => {
    const filePath = scaffoldFilePath(config, 'middleware', name, '.ts')

    if (existsSync(filePath)) {
      logger.error(`File already exists: ${filePath}`)
      process.exit(1)
    }

    let content: string

    switch (type) {
      case 'factory':
        content = `import { pikkuMiddlewareFactory } from '#pikku'

export const ${name} = pikkuMiddlewareFactory(
  (param: string) =>
    async ({ logger }, _data, next) => {
      logger.info(\`[\${param}] before\`)
      const result = await next()
      logger.info(\`[\${param}] after\`)
      return result
    }
)
`
        break

      case 'simple':
      default:
        content = `import { pikkuMiddleware } from '#pikku'

export const ${name} = pikkuMiddleware(
  async ({ logger }, _data, next) => {
    // TODO: implement
    const result = await next()
    return result
  }
)
`
        break
    }

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    logger.info(`Created middleware at ${filePath}`)
    console.log(filePath)
  },
})
