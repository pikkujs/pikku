import { ChannelsMeta } from '@pikku/core/channel'
import { getFileImportRelativePath } from '../utils.js'

export const serializeChannels = (
  outputPath: string,
  filesWithChannels: Set<string>,
  packageMappings: Record<string, string> = {}
) => {
  const serializedOutput: string[] = [
    '/* The files with an addChannel function call */',
  ]

  Array.from(filesWithChannels)
    .sort()
    .forEach((path) => {
      const filePath = getFileImportRelativePath(
        outputPath,
        path,
        packageMappings
      )
      serializedOutput.push(`import '${filePath}'`)
    })

  return serializedOutput.join('\n')
}

export const serializeChannelMeta = (channelsMeta: ChannelsMeta) => {
  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    `pikkuState('channel', 'meta', ${JSON.stringify(channelsMeta, null, 2)})`
  )
  return serializedOutput.join('\n')
}
