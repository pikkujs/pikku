import { existsSync } from 'fs'
import { dirname } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { pikkuSessionlessFunc } from '#pikku'
import { scaffoldFilePath } from '../../utils/file-writer.js'

export const pikkuNewPermission = pikkuSessionlessFunc<
  { name: string; type?: string },
  void
>({
  func: async ({ logger, config }, { name, type = 'simple' }) => {
    const filePath = scaffoldFilePath(config, 'permissions', name, '.ts')

    if (existsSync(filePath)) {
      logger.error(`File already exists: ${filePath}`)
      process.exit(1)
    }

    let content: string

    switch (type) {
      case 'factory':
        content = `import { pikkuPermissionFactory } from '#pikku'

export const ${name} = pikkuPermissionFactory(
  (param: string) =>
    async ({ logger }, _data, { session }) => {
      // TODO: implement permission check
      return true
    }
)
`
        break

      case 'simple':
      default:
        content = `import { pikkuPermission } from '#pikku'

export const ${name} = pikkuPermission(
  async ({ logger }, _data, { session }) => {
    // TODO: implement permission check
    return true
  }
)
`
        break
    }

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    logger.info(`Created permission at ${filePath}`)
    console.log(filePath)
  },
})
