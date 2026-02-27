import { existsSync } from 'fs'
import { dirname } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { pikkuSessionlessFunc } from '#pikku'
import { scaffoldFilePath } from '../../utils/file-writer.js'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const pikkuNewFunction = pikkuSessionlessFunc<
  { name: string; type?: string },
  void
>({
  func: async ({ logger, config }, { name, type = 'sessionless' }) => {
    const filePath = scaffoldFilePath(
      config,
      'functions',
      name,
      '.functions.ts'
    )

    if (existsSync(filePath)) {
      logger.error(`File already exists: ${filePath}`)
      process.exit(1)
    }

    const inputName = capitalize(name) + 'Input'
    const outputName = capitalize(name) + 'Output'

    let content: string

    switch (type) {
      case 'func':
        content = `import { pikkuFunc } from '#pikku'

export type ${inputName} = {
  // TODO: define input
}

export type ${outputName} = {
  // TODO: define output
}

export const ${name} = pikkuFunc<${inputName}, ${outputName}>({
  func: async ({ logger }, data, { session }) => {
    // TODO: implement
    return {} as ${outputName}
  },
})
`
        break

      case 'void':
        content = `import { pikkuVoidFunc } from '#pikku'

export type ${inputName} = {
  // TODO: define input
}

export const ${name} = pikkuVoidFunc<${inputName}>({
  func: async ({ logger }, data) => {
    // TODO: implement
  },
})
`
        break

      case 'sessionless':
      default:
        content = `import { pikkuSessionlessFunc } from '#pikku'

export type ${inputName} = {
  // TODO: define input
}

export type ${outputName} = {
  // TODO: define output
}

export const ${name} = pikkuSessionlessFunc<${inputName}, ${outputName}>({
  func: async ({ logger }, data) => {
    // TODO: implement
    return {} as ${outputName}
  },
})
`
        break
    }

    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, 'utf-8')
    logger.info(`Created function at ${filePath}`)
    console.log(filePath)
  },
})
